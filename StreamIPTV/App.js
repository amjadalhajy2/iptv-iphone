import 'react-native-url-polyfill/auto';
import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, View, StatusBar, TouchableOpacity, Text, Dimensions, TouchableWithoutFeedback, PanResponder } from 'react-native';
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
  const [volume, setVolume] = useState(100);
  const [brightness, setBrightness] = useState(0.5);

  const webViewRef = useRef(null);
  const vlcRef = useRef(null);
  const controlsTimer = useRef(null);
  const syncTimer = useRef(null);
  const lastTap = useRef(null);

  // 🔥 تأمين الرابط في متغير ثابت لمنع أي تحديث (Refresh) عشوائي لصفحة الويب
  const webviewSource = useRef({ uri: 'https://amjadalhajy2.github.io/iptv-iphone/' }).current; // ⬅️ تذكر وضع رابط صفحتك هنا

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
      const { data: existingRecord } = await supabase.from('user_activity')
        .select('id').eq('username', videoData.userId).eq('profile_name', videoData.profileName).eq('movie_id', videoData.videoId).maybeSingle();

      if (existingRecord && existingRecord.id) {
        await supabase.from('user_activity').update({ resume_time: currentTimeSec, updated_at: new Date() }).eq('id', existingRecord.id);
      } else {
        await supabase.from('user_activity').insert([{
          username: videoData.userId, profile_name: videoData.profileName, movie_id: videoData.videoId,
          item_type: videoData.itemType, item_data: videoData.itemData, resume_time: currentTimeSec, updated_at: new Date()
        }]);
      }
    } catch (e) { console.log("Sync Error:", e); }
  };

  const onProgress = (e) => {
    const currentDur = e.duration;
    const currentPos = e.currentTime;
    if (currentDur > 0) setDuration(currentDur);
    setProgress(currentPos);

    if (!hasResumed && currentDur > 0 && resumeTime > 0) {
      const ratio = (resumeTime * 1000) / currentDur;
      if (ratio > 0 && ratio < 0.95) vlcRef.current.seek(ratio);
      setHasResumed(true);
    }

    if (currentDur > 0 && currentDur - currentPos < 2000 && videoData?.nextEpisode) playNextEpisode();

    if (!syncTimer.current) {
      syncTimer.current = setTimeout(() => {
        forceSyncNow(Math.floor(currentPos / 1000), Math.floor(currentDur / 1000));
        syncTimer.current = null;
      }, 10000);
    }
  };

  const playNextEpisode = () => {
    if(!videoData?.nextEpisode) return;
    setVideoData({ ...videoData, url: videoData.nextEpisode.url, videoId: videoData.nextEpisode.id, nextEpisode: videoData.nextEpisode.nextAfterThat });
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

  const skipForward = () => { if (duration > 0 && vlcRef.current) { vlcRef.current.seek(Math.min(1, (progress + 10000) / duration)); triggerControlsTimeout(); }};
  const skipBackward = () => { if (duration > 0 && vlcRef.current) { vlcRef.current.seek(Math.max(0, (progress - 10000) / duration)); triggerControlsTimeout(); }};

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => Math.abs(gestureState.dy) > 10,
      onPanResponderMove: async (evt, gestureState) => {
        const { dy, x0 } = gestureState;
        const isLeftSide = x0 < screenHeight / 2;
        if (isLeftSide) {
          let newBrightness = Math.max(0, Math.min(1, brightness - (dy / 5000)));
          setBrightness(newBrightness);
          await Brightness.setBrightnessAsync(newBrightness);
        } else {
          let newVolume = Math.max(0, Math.min(100, volume - (dy / 50)));
          setVolume(newVolume);
        }
        triggerControlsTimeout();
      }
    })
  ).current;

  const handleScreenTap = () => {
    const now = Date.now();
    const DOUBLE_PRESS_DELAY = 300;
    if (lastTap.current && (now - lastTap.current) < DOUBLE_PRESS_DELAY) {
      skipForward();
    } else {
      showControls ? setShowControls(false) : triggerControlsTimeout();
    }
    lastTap.current = now;
  };

  return (
    <View style={styles.container}>
      <StatusBar hidden={!!videoData} barStyle="light-content" backgroundColor="transparent" translucent={true} />
      
      {/* 🔥 الحل: لا نمسح الصفحة أبداً! فقط نخفيها باستخدام opacity=0 لكي يستمر الآيفون بتشغيلها في الخلفية وتحتفظ بصفحة التفاصيل */}
      <View style={[styles.webviewContainer, videoData ? { opacity: 0, zIndex: -1 } : { opacity: 1, zIndex: 1 }]}>
        <WebView
          ref={webViewRef}
          source={webviewSource} 
          javaScriptEnabled={true} domStorageEnabled={true} allowsInlineMediaPlayback={true} allowsBackForwardNavigationGestures={true} originWhitelist={['*']} onMessage={handleMessageFromWeb}
          style={{ flex: 1, backgroundColor: '#0a0a0a' }}
        />
      </View>

      {/* 🔥 جعلنا طبقة الفيديو تأتي فوق طبقة الويب تماماً بصلاحية zIndex: 999 */}
      {videoData && (
        <View style={[styles.playerContainer, { zIndex: 999 }]} {...panResponder.panHandlers}>
          <TouchableWithoutFeedback onPress={handleScreenTap}>
            <View style={styles.videoTouchable}>
              <VLCPlayer ref={vlcRef} style={styles.videoPlayer} videoAspectRatio="16:9" source={{ uri: videoData.url }} autoplay={true} paused={isPaused} resizeMode="contain" onProgress={onProgress} onEnd={handleClosePlayer} onError={handleClosePlayer} volume={volume} />
            </View>
          </TouchableWithoutFeedback>

          {showControls && (
            <View style={styles.controlsOverlay} pointerEvents="box-none">
              
              <View style={styles.topControls}>
                <TouchableOpacity style={styles.iconBtn} onPress={handleClosePlayer}>
                  <Ionicons name="close" size={28} color="white" />
                </TouchableOpacity>
                <Text style={styles.videoTitleText}>{videoData.itemData?.name || videoData.itemData?.title || 'جاري التشغيل'}</Text>
              </View>

              <View style={styles.centerControls} pointerEvents="box-none">
                <TouchableOpacity style={styles.seekBtn} onPress={skipBackward}>
                  <MaterialIcons name="replay-10" size={45} color="white" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.playBtn} onPress={() => { setIsPaused(!isPaused); triggerControlsTimeout(); }}>
                  <Ionicons name={isPaused ? "play" : "pause"} size={50} color="white" style={{marginLeft: isPaused ? 5 : 0}} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.seekBtn} onPress={skipForward}>
                  <MaterialIcons name="forward-10" size={45} color="white" />
                </TouchableOpacity>
              </View>

              <View style={styles.bottomControls}>
                {videoData.nextEpisode && (duration > 0 && (duration - progress <= 180000)) && (
                  <TouchableOpacity style={styles.nextEpContainer} onPress={playNextEpisode}>
                    <Text style={styles.nextEpText}>الحلقة القادمة</Text>
                    <Ionicons name="play-skip-forward" size={18} color="white" style={{marginLeft: 5}}/>
                  </TouchableOpacity>
                )}
                <View style={styles.progressRow}>
                  <Text style={styles.timeText}>{formatTime(progress)}</Text>
                  <Slider
                    style={{flex: 1, height: 40}}
                    minimumValue={0}
                    maximumValue={duration > 0 ? duration : 1}
                    value={progress}
                    minimumTrackTintColor="#e50914"
                    maximumTrackTintColor="rgba(255,255,255,0.3)"
                    thumbTintColor="#e50914"
                    onSlidingStart={() => clearTimeout(controlsTimer.current)}
                    onSlidingComplete={(val) => { if(vlcRef.current && duration > 0){ vlcRef.current.seek(val / duration); triggerControlsTimeout(); } }}
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
  
  controlsOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'space-between', backgroundColor: 'rgba(0,0,0,0.6)' },
  topControls: { flexDirection: 'row', alignItems: 'center', padding: 25 },
  iconBtn: { padding: 10 },
  videoTitleText: { color: 'white', fontSize: 18, fontWeight: 'bold', marginLeft: 15, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: {width: 1, height: 1}, textShadowRadius: 3 },
  
  centerControls: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 60 },
  playBtn: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#FFF' },
  seekBtn: { padding: 10, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 30 },
  
  bottomControls: { paddingHorizontal: 30, paddingBottom: 25, alignItems: 'flex-end' },
  nextEpContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e50914', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 5, marginBottom: 15 },
  nextEpText: { color: '#FFF', fontSize: 14, fontWeight: 'bold' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%' },
  timeText: { color: '#FFF', fontSize: 13, fontWeight: '600', width: 50, textAlign: 'center' },
});
