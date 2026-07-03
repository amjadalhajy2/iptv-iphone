import 'react-native-url-polyfill/auto';
import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, View, StatusBar, TouchableOpacity, Text, Dimensions, TouchableWithoutFeedback } from 'react-native';
import { WebView } from 'react-native-webview';
import { VLCPlayer } from 'react-native-vlc-media-player';
import { createClient } from '@supabase/supabase-js';
import ReactNativeBlobUtil from 'react-native-blob-util';
import * as ScreenOrientation from 'expo-screen-orientation';

const SUPABASE_URL = 'https://kpfymvtyqbyjmlqfgujo.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_g7dHfpmPHcQwAWsO9FFuGw_4lG8fyLc';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default function App() {
  const [videoUrl, setVideoUrl] = useState(null);
  const [videoId, setVideoId] = useState(null);
  const [userId, setUserId] = useState(null);
  
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  
  const [resumeTime, setResumeTime] = useState(0);
  const [hasResumed, setHasResumed] = useState(false);
  
  // الحلقة القادمة
  const [nextEpisode, setNextEpisode] = useState(null);

  const webViewRef = useRef(null);
  const vlcRef = useRef(null);
  const controlsTimer = useRef(null);
  const syncTimer = useRef(null);

  const handleMessageFromWeb = async (event) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      if (message.type === 'PLAY_VIDEO') {
        // دوران الشاشة أفقي
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        
        setVideoUrl(message.url);
        setVideoId(message.videoId);
        setUserId(message.userId);
        setResumeTime(message.resumeTime || 0);
        setNextEpisode(message.nextEpisode || null);
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
    if (!videoId || !userId || currentTimeSec <= 0) return;
    await supabase.from('watch_history').upsert({ 
        user_id: userId, video_id: videoId, last_position: currentTimeSec, 
        total_duration: totalDurationSec, updated_at: new Date()
    }, { onConflict: 'user_id,video_id' });
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

    // التشغيل التلقائي للحلقة القادمة عند النهاية
    if (currentDur > 0 && currentDur - currentPos < 2000 && nextEpisode) {
      playNextEpisode();
    }

    // مزامنة مع سوبابيس كل 10 ثواني وليس في كل مللي ثانية لتخفيف الضغط
    if (!syncTimer.current) {
      syncTimer.current = setTimeout(() => {
        forceSyncNow(Math.floor(currentPos / 1000), Math.floor(currentDur / 1000));
        syncTimer.current = null;
      }, 10000);
    }
  };

  const playNextEpisode = () => {
    if(!nextEpisode) return;
    setVideoUrl(nextEpisode.url);
    setVideoId(nextEpisode.id);
    setResumeTime(0);
    setHasResumed(false);
    setProgress(0);
    setNextEpisode(nextEpisode.nextAfterThat); // إذا تم تمريرها
  };

  const handleClosePlayer = async () => {
    forceSyncNow(Math.floor(progress / 1000), Math.floor(duration / 1000));
    setVideoUrl(null);
    setVideoId(null);
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP); // العودة للوضع الرأسي
  };

  const formatTime = (ms) => {
    if (isNaN(ms) || ms < 0) return "00:00";
    let secs = Math.floor(ms / 1000);
    let h = Math.floor(secs / 3600);
    let m = Math.floor((secs % 3600) / 60);
    let s = secs % 60;
    let timeStr = `${m < 10 ? '0'+m : m}:${s < 10 ? '0'+s : s}`;
    return h > 0 ? `${h}:${timeStr}` : timeStr;
  };

  const triggerControlsTimeout = () => {
    setShowControls(true);
    clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => setShowControls(false), 5000);
  };

  const skipForward = () => { if (duration > 0 && vlcRef.current) vlcRef.current.seek(Math.min(1, (progress + 10000) / duration)); triggerControlsTimeout(); };
  const skipBackward = () => { if (duration > 0 && vlcRef.current) vlcRef.current.seek(Math.max(0, (progress - 10000) / duration)); triggerControlsTimeout(); };

  // إظهار زر الحلقة القادمة إذا تبقي 3 دقائق
  const showNextEpBtn = duration > 0 && (duration - progress <= 180000) && nextEpisode;

  return (
    <View style={styles.container}>
      <StatusBar hidden={!!videoUrl} barStyle="light-content" backgroundColor="transparent" translucent={true} />
      
      <View style={[styles.webviewContainer, videoUrl ? styles.hidden : null]}>
        <WebView
          ref={webViewRef}
          source={{ uri: 'https://amjadalhajy2.github.io/iptv-iphone/' }} // ⬅️ تذكر رابط صفحتك
          javaScriptEnabled={true} domStorageEnabled={true} allowsInlineMediaPlayback={true} allowsBackForwardNavigationGestures={true} originWhitelist={['*']} onMessage={handleMessageFromWeb}
          style={{ flex: 1, backgroundColor: '#0a0a0a' }}
        />
      </View>

      {videoUrl && (
        <View style={styles.playerContainer}>
          <TouchableWithoutFeedback onPress={() => showControls ? setShowControls(false) : triggerControlsTimeout()}>
            <View style={styles.videoTouchable}>
              <VLCPlayer ref={vlcRef} style={styles.videoPlayer} videoAspectRatio="16:9" source={{ uri: videoUrl }} autoplay={true} paused={isPaused} resizeMode="contain" onProgress={onProgress} onEnd={handleClosePlayer} onError={handleClosePlayer} />
            </View>
          </TouchableWithoutFeedback>

          {showControls && (
            <View style={styles.controlsOverlay} pointerEvents="box-none">
              <View style={styles.topControls}>
                <TouchableOpacity style={styles.iconBtn} onPress={handleClosePlayer}>
                  <Text style={styles.iconText}>✕</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.centerControls} pointerEvents="box-none">
                <TouchableOpacity style={styles.seekBtn} onPress={skipBackward}><Text style={styles.seekText}>↺ 10</Text></TouchableOpacity>
                <TouchableOpacity style={styles.playBtn} onPress={() => { setIsPaused(!isPaused); triggerControlsTimeout(); }}>
                  <Text style={styles.playIcon}>{isPaused ? '▶' : '⏸'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.seekBtn} onPress={skipForward}><Text style={styles.seekText}>10 ↻</Text></TouchableOpacity>
              </View>

              <View style={styles.bottomControls}>
                {showNextEpBtn && (
                  <TouchableOpacity style={styles.nextEpContainer} onPress={playNextEpisode}>
                    <Text style={styles.nextEpText}>الحلقة القادمة ▶</Text>
                  </TouchableOpacity>
                )}
                <View style={styles.progressRow}>
                  <Text style={styles.timeText}>{formatTime(progress)}</Text>
                  <View style={styles.progressBarBg}><View style={[styles.progressBarFill, { width: `${duration > 0 ? (progress / duration) * 100 : 0}%` }]} /></View>
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
  container: { flex: 1, backgroundColor: '#0a0a0a' }, webviewContainer: { flex: 1 }, hidden: { display: 'none' },
  playerContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', justifyContent: 'center' },
  videoTouchable: { flex: 1, width: '100%', height: '100%', justifyContent: 'center' }, videoPlayer: { width: '100%', height: '100%' },
  
  controlsOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'space-between', backgroundColor: 'rgba(0,0,0,0.5)' },
  topControls: { flexDirection: 'row', justifyContent: 'flex-start', padding: 30, paddingTop: 40 },
  iconBtn: { width: 45, height: 45, borderRadius: 25, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  iconText: { color: '#FFF', fontSize: 20, fontWeight: 'bold' },
  
  centerControls: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 60 },
  playBtn: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#FFF' },
  playIcon: { color: '#FFF', fontSize: 35, marginLeft: 5 },
  seekBtn: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  seekText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  
  bottomControls: { paddingHorizontal: 40, paddingBottom: 40, alignItems: 'flex-end' },
  nextEpContainer: { backgroundColor: '#e50914', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, marginBottom: 20 },
  nextEpText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 15, width: '100%' },
  timeText: { color: '#FFF', fontSize: 14, fontWeight: 'bold', width: 55, textAlign: 'center' },
  progressBarBg: { flex: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 3 },
  progressBarFill: { height: '100%', backgroundColor: '#e50914', borderRadius: 3 },
});
