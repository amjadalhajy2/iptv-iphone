import 'react-native-url-polyfill/auto';
import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, View, StatusBar, TouchableOpacity, Text, Dimensions, TouchableWithoutFeedback, PanResponder, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import { VLCPlayer } from 'react-native-vlc-media-player';
import { createClient } from '@supabase/supabase-js';
import ReactNativeBlobUtil from 'react-native-blob-util';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Brightness from 'expo-brightness';
import Slider from '@react-native-community/slider';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';

const SUPABASE_URL = 'https://kpfymvtyqbyjmlqfgujo.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_g7dHfpmPHcQwAWsO9FFuGw_4lG8fyLc';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export default function App() {
  const [videoData, setVideoData] = useState(null);
  
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  
  const [resumeTime, setResumeTime] = useState(0);
  const [hasResumed, setHasResumed] = useState(false);
  
  // حالات الإيماءات والأبعاد
  const [volume, setVolume] = useState(100);
  const [brightness, setBrightness] = useState(0.5);
  const [resizeMode, setResizeMode] = useState('contain'); // contain, cover, stretch
  const [indicator, setIndicator] = useState({ type: null, value: 0 }); // type: 'volume' | 'brightness'
  
  // حالات شريط التمرير
  const [isSliding, setIsSliding] = useState(false);
  const [slidingTime, setSlidingTime] = useState(0);

  const webViewRef = useRef(null);
  const vlcRef = useRef(null);
  const controlsTimer = useRef(null);
  const syncTimer = useRef(null);
  const indicatorTimer = useRef(null);
  const lastTap = useRef(null);

  const webviewSource = useRef({ uri: 'https://amjadalhajy2.github.io/iptv-iphone/' }).current; // ⬅️ رابط صفحتك

  useEffect(() => {
    (async () => {
      const { status } = await Brightness.requestPermissionsAsync();
      if (status === 'granted') {
        const currentBrightness = await Brightness.getBrightnessAsync();
        setBrightness(currentBrightness);
      }
    })();
  }, []);

  const handleMessageFromWeb = async (event) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      if (message.type === 'PLAY_VIDEO') {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        setVideoData(message);
        setResumeTime(message.resumeTime || 0);
        setHasResumed(false);
        setIsPaused(false);
        setProgress(0);
        setDuration(0);
        setResizeMode('contain'); // العودة للوضع الافتراضي
        triggerControlsTimeout();
      }
      
      if (message.type === 'PROXY_FETCH') {
        try {
          const response = await ReactNativeBlobUtil.config({ trusty: true }).fetch('GET', message.url, { 'User-Agent': 'IPTVSmartersPro' });
          const text = await response.text();
          const safeData = encodeURIComponent(text).replace(/'/g, "%27");
          webViewRef.current.injectJavaScript(`if(window.pendingFetches['${message.reqId}']) { window.pendingFetches['${message.reqId}'].resolve(JSON.parse(decodeURIComponent('${safeData}'))); delete window.pendingFetches['${message.reqId}']; } true;`);
        } catch (err) {
          webViewRef.current.injectJavaScript(`if(window.pendingFetches['${message.reqId}']) { window.pendingFetches['${message.reqId}'].reject(new Error("${err.message}")); delete window.pendingFetches['${message.reqId}']; } true;`);
        }
      }
    } catch (error) { console.error("Bridge Error:", error); }
  };

  const forceSyncNow = async (currentTimeSec, totalDurationSec) => {
    if (!videoData || !videoData.userId || currentTimeSec <= 0) return;
    try {
      const { data: existingRecord } = await supabase.from('user_activity').select('id').eq('username', videoData.userId).eq('profile_name', videoData.profileName).eq('movie_id', videoData.videoId).maybeSingle();
      if (existingRecord && existingRecord.id) {
        await supabase.from('user_activity').update({ resume_time: currentTimeSec, item_data: videoData.itemData, updated_at: new Date() }).eq('id', existingRecord.id);
      } else {
        await supabase.from('user_activity').insert([{ username: videoData.userId, profile_name: videoData.profileName, movie_id: videoData.videoId, item_type: videoData.itemType, item_data: videoData.itemData, resume_time: currentTimeSec, updated_at: new Date() }]);
      }
    } catch (e) { console.log("Sync Error:", e); }
  };

  const onProgress = (e) => {
    if(isSliding) return; // منع تحديث الشريط برمجياً أثناء سحب المستخدم له
    
    const currentDur = e.duration;
    const currentPos = e.currentTime;
    if (currentDur > 0) setDuration(currentDur);
    setProgress(currentPos);

    if (!hasResumed && currentDur > 0 && resumeTime > 0) {
      const ratio = (resumeTime * 1000) / currentDur;
      if (ratio > 0 && ratio < 0.95) vlcRef.current.seek(ratio);
      setHasResumed(true);
    }

    if (!syncTimer.current) {
      syncTimer.current = setTimeout(() => {
        forceSyncNow(Math.floor(currentPos / 1000), Math.floor(currentDur / 1000));
        syncTimer.current = null;
      }, 10000);
    }
  };

  const playNextEpisode = () => {
    if(!videoData?.nextEpisode) return;
    let updatedItemData = { ...videoData.itemData };
    updatedItemData.current_episode_id = videoData.nextEpisode.id;
    updatedItemData.current_episode_num = videoData.nextEpisode.num;
    setVideoData({ ...videoData, url: videoData.nextEpisode.url, itemData: updatedItemData, nextEpisode: videoData.nextEpisode.nextAfterThat });
    setResumeTime(0); setHasResumed(false); setProgress(0);
  };

  const handleClosePlayer = async () => {
    forceSyncNow(Math.floor(progress / 1000), Math.floor(duration / 1000));
    setVideoData(null);
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  };

  const formatTime = (ms) => {
    if (isNaN(ms) || ms < 0) return "00:00";
    let secs = Math.floor(ms / 1000); let h = Math.floor(secs / 3600); let m = Math.floor((secs % 3600) / 60); let s = secs % 60;
    let timeStr = `${m < 10 ? '0'+m : m}:${s < 10 ? '0'+s : s}`;
    return h > 0 ? `${h}:${timeStr}` : timeStr;
  };

  const triggerControlsTimeout = () => {
    setShowControls(true); clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => setShowControls(false), 5000);
  };

  const showIndicatorPopup = (type, val) => {
    setIndicator({ type, value: val });
    clearTimeout(indicatorTimer.current);
    indicatorTimer.current = setTimeout(() => setIndicator({ type: null, value: 0 }), 1500);
  };

  const cycleResizeMode = () => {
    const modes = ['contain', 'cover', 'stretch']; // احتواء، تكبير، ملء الشاشة
    setResizeMode(modes[(modes.indexOf(resizeMode) + 1) % modes.length]);
    triggerControlsTimeout();
  };

  const handleCast = () => {
    Alert.alert("مشاركة الشاشة (Screen Mirroring)", "يرجى فتح 'مركز التحكم' (Control Center) في الآيفون والضغط على زر انعكاس الشاشة لبث الفيديو إلى التلفاز بوضوح عالي.", [{ text: "حسناً" }]);
    triggerControlsTimeout();
  };

  const skipForward = () => { if (duration > 0 && vlcRef.current) { vlcRef.current.seek(Math.min(1, (progress + 10000) / duration)); triggerControlsTimeout(); }};
  const skipBackward = () => { if (duration > 0 && vlcRef.current) { vlcRef.current.seek(Math.max(0, (progress - 10000) / duration)); triggerControlsTimeout(); }};

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => Math.abs(gestureState.dy) > 15,
      onPanResponderMove: async (evt, gestureState) => {
        const { dy, x0 } = gestureState;
        // الشاشة أفقية، لذا نستخدم screenHeight للتمييز بين اليمين واليسار (لأن الأبعاد تنقلب)
        const isLeftSide = x0 < screenHeight / 2; 
        
        if (isLeftSide) {
          let newBrightness = Math.max(0, Math.min(1, brightness - (dy / 250)));
          setBrightness(newBrightness);
          await Brightness.setBrightnessAsync(newBrightness);
          showIndicatorPopup('brightness', Math.round(newBrightness * 100));
        } else {
          let newVolume = Math.max(0, Math.min(100, volume - (dy / 2.5)));
          setVolume(newVolume);
          showIndicatorPopup('volume', Math.round(newVolume));
        }
        triggerControlsTimeout();
      }
    })
  ).current;

  const handleScreenTap = () => {
    const now = Date.now();
    if (lastTap.current && (now - lastTap.current) < 300) skipForward();
    else showControls ? setShowControls(false) : triggerControlsTimeout();
    lastTap.current = now;
  };

  // إظهار زر الحلقة القادمة في آخر 3 دقائق
  const showNextEpBtn = videoData?.nextEpisode && (duration > 0) && ((duration - progress) <= 180000);

  return (
    <View style={styles.container}>
      <StatusBar hidden={!!videoData} barStyle="light-content" backgroundColor="transparent" translucent={true} />
      
      <View style={[styles.webviewContainer, videoData ? { opacity: 0, zIndex: -1 } : { opacity: 1, zIndex: 1 }]}>
        <WebView ref={webViewRef} source={webviewSource} javaScriptEnabled={true} domStorageEnabled={true} allowsInlineMediaPlayback={true} allowsBackForwardNavigationGestures={true} originWhitelist={['*']} onMessage={handleMessageFromWeb} style={{ flex: 1, backgroundColor: '#0a0a0a' }} />
      </View>

      {videoData && (
        <View style={[styles.playerContainer, { zIndex: 999 }]} {...panResponder.panHandlers}>
          
          <TouchableWithoutFeedback onPress={handleScreenTap}>
            <View style={styles.videoTouchable}>
              <VLCPlayer ref={vlcRef} style={styles.videoPlayer} videoAspectRatio="16:9" source={{ uri: videoData.url }} autoplay={true} paused={isPaused} resizeMode={resizeMode} onProgress={onProgress} onEnd={handleClosePlayer} onError={handleClosePlayer} volume={volume} />
            </View>
          </TouchableWithoutFeedback>

          {/* نافذة الإضاءة والصوت المنبثقة */}
          {indicator.type && (
            <View style={styles.indicatorPopup}>
              <Ionicons name={indicator.type === 'volume' ? (indicator.value === 0 ? "volume-mute" : "volume-high") : "sunny"} size={45} color="white" />
              <Text style={styles.indicatorText}>{indicator.value}%</Text>
            </View>
          )}

          {showControls && (
            <View style={styles.controlsOverlay} pointerEvents="box-none">
              
              <View style={styles.topControls}>
                <TouchableOpacity style={styles.iconBtn} onPress={handleClosePlayer}>
                  <Ionicons name="close" size={32} color="white" />
                </TouchableOpacity>
                <Text style={styles.videoTitleText}>{videoData.itemData?.name || videoData.itemData?.title || 'جاري التشغيل'}</Text>
                
                <View style={{flex: 1}} /> {/* مساحة فاصلة */}
                
                {/* أزرار البث والأبعاد */}
                <TouchableOpacity style={styles.topRightBtn} onPress={handleCast}>
                  <Ionicons name="tv-outline" size={26} color="white" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.topRightBtn} onPress={cycleResizeMode}>
                  <MaterialIcons name="aspect-ratio" size={26} color="white" />
                </TouchableOpacity>
              </View>

              <View style={styles.centerControls} pointerEvents="box-none">
                <TouchableOpacity style={styles.seekBtn} onPress={skipBackward}><MaterialIcons name="replay-10" size={50} color="white" /></TouchableOpacity>
                <TouchableOpacity style={styles.playBtn} onPress={() => { setIsPaused(!isPaused); triggerControlsTimeout(); }}>
                  <Ionicons name={isPaused ? "play" : "pause"} size={55} color="white" style={{marginLeft: isPaused ? 6 : 0}} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.seekBtn} onPress={skipForward}><MaterialIcons name="forward-10" size={50} color="white" /></TouchableOpacity>
              </View>

              <View style={styles.bottomControls}>
                
                {/* زر الحلقة القادمة العائم */}
                {showNextEpBtn && (
                  <TouchableOpacity style={styles.nextEpAbsoluteBtn} onPress={playNextEpisode}>
                    <Text style={styles.nextEpAbsoluteText}>تشغيل الحلقة القادمة</Text>
                    <Ionicons name="play-skip-forward" size={18} color="white" style={{marginLeft: 8}}/>
                  </TouchableOpacity>
                )}

                {/* فقاعة الوقت أثناء السحب */}
                {isSliding && (
                  <View style={styles.slidingBubble}>
                    <Text style={styles.slidingBubbleText}>{formatTime(slidingTime)}</Text>
                  </View>
                )}

                <View style={styles.progressRow}>
                  <Text style={styles.timeText}>{formatTime(progress)}</Text>
                  <Slider
                    style={{flex: 1, height: 40}}
                    minimumValue={0}
                    maximumValue={duration > 0 ? duration : 1}
                    value={isSliding ? slidingTime : progress}
                    minimumTrackTintColor="#e50914"
                    maximumTrackTintColor="rgba(255,255,255,0.3)"
                    thumbTintColor="#e50914"
                    onValueChange={(val) => {
                      setIsSliding(true);
                      setSlidingTime(val);
                      clearTimeout(controlsTimer.current); // إيقاف إخفاء الأزرار أثناء السحب
                    }}
                    onSlidingComplete={(val) => {
                      setIsSliding(false);
                      if(vlcRef.current && duration > 0){
                        vlcRef.current.seek(val / duration);
                        triggerControlsTimeout();
                      }
                    }}
                  />
                  <Text style={styles.timeText}>{formatTime(duration)}</Text>
                </View>
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' }, webviewContainer: { flex: 1 },
  playerContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', justifyContent: 'center' },
  videoTouchable: { flex: 1, width: '100%', height: '100%', justifyContent: 'center' }, videoPlayer: { width: '100%', height: '100%' },
  
  controlsOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'space-between', backgroundColor: 'rgba(0,0,0,0.5)' },
  
  topControls: { flexDirection: 'row', alignItems: 'center', padding: 25 },
  iconBtn: { padding: 5 },
  videoTitleText: { color: 'white', fontSize: 20, fontWeight: 'bold', marginLeft: 15, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: {width: 1, height: 1}, textShadowRadius: 4 },
  topRightBtn: { padding: 10, marginLeft: 15, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 25 },
  
  centerControls: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 70 },
  playBtn: { width: 90, height: 90, borderRadius: 45, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#FFF' },
  seekBtn: { padding: 10, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 35 },
  
  bottomControls: { paddingHorizontal: 30, paddingBottom: 25, position: 'relative' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%' },
  timeText: { color: '#FFF', fontSize: 14, fontWeight: 'bold', width: 55, textAlign: 'center' },
  
  // النافذة المنبثقة للصوت والإضاءة
  indicatorPopup: { position: 'absolute', alignSelf: 'center', top: '40%', backgroundColor: 'rgba(0,0,0,0.7)', padding: 25, borderRadius: 15, alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  indicatorText: { color: 'white', fontSize: 22, fontWeight: 'bold', marginTop: 10 },
  
  // فقاعة الوقت عند سحب الشريط
  slidingBubble: { alignSelf: 'center', backgroundColor: '#e50914', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8, marginBottom: 10 },
  slidingBubbleText: { color: 'white', fontSize: 16, fontWeight: 'bold', letterSpacing: 1 },

  // زر الحلقة القادمة
  nextEpAbsoluteBtn: { position: 'absolute', right: 40, bottom: 80, flexDirection: 'row', alignItems: 'center', backgroundColor: '#e50914', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 5, shadowOffset: {width:0, height:2} },
  nextEpAbsoluteText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
});
