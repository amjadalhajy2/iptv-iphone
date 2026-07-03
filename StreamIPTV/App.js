import 'react-native-url-polyfill/auto';
import React, { useState, useRef } from 'react';
// 🔥 تم استبدال SafeAreaView بـ View لملء الشاشة بالكامل
import { StyleSheet, View, StatusBar, TouchableOpacity, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { VLCPlayer } from 'react-native-vlc-media-player';
import { createClient } from '@supabase/supabase-js';
import ReactNativeBlobUtil from 'react-native-blob-util';

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
  
  // 🔥 حالات جديدة لاستكمال التشغيل
  const [resumeTime, setResumeTime] = useState(0);
  const [hasResumed, setHasResumed] = useState(false);

  const webViewRef = useRef(null);
  const vlcRef = useRef(null);
  const controlsTimer = useRef(null);

  const handleMessageFromWeb = async (event) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      
      if (message.type === 'PLAY_VIDEO') {
        setVideoUrl(message.url);
        setVideoId(message.videoId);
        setUserId(message.userId);
        
        // التقاط وقت التوقف من الصفحة
        setResumeTime(message.resumeTime || 0);
        setHasResumed(false);
        
        setIsPaused(false);
        setProgress(0);
        setDuration(0);
        triggerControlsTimeout();
      }
      
      if (message.type === 'PROXY_FETCH') {
        try {
          const response = await ReactNativeBlobUtil.config({ trusty: true }).fetch('GET', message.url, {
            'User-Agent': 'IPTVSmartersPro', 
            'Accept': '*/*'
          });
          const text = await response.text();
          const safeData = encodeURIComponent(text).replace(/'/g, "%27");
          const script = `
            if(window.pendingFetches && window.pendingFetches['${message.reqId}']) {
               try { window.pendingFetches['${message.reqId}'].resolve(JSON.parse(decodeURIComponent('${safeData}'))); } 
               catch(e) { window.pendingFetches['${message.reqId}'].reject(e); }
               delete window.pendingFetches['${message.reqId}'];
            } true;
          `;
          webViewRef.current.injectJavaScript(script);
        } catch (err) {
          const script = `
            if(window.pendingFetches && window.pendingFetches['${message.reqId}']) {
               window.pendingFetches['${message.reqId}'].reject(new Error("${err.message}"));
               delete window.pendingFetches['${message.reqId}'];
            } true;
          `;
          webViewRef.current.injectJavaScript(script);
        }
      }
    } catch (error) { console.error("Bridge Error:", error); }
  };

  const syncProgressWithSupabase = async (playbackData) => {
    if (!videoId || !userId) return;
    const currentTimeInSeconds = Math.floor(playbackData.currentTime / 1000);
    const totalDurationInSeconds = Math.floor(playbackData.duration / 1000);
    if (currentTimeInSeconds <= 0) return;

    await supabase.from('watch_history').upsert({ 
        user_id: userId, video_id: videoId, last_position: currentTimeInSeconds, 
        total_duration: totalDurationInSeconds, updated_at: new Date()
    }, { onConflict: 'user_id,video_id' });
  };

  const onProgress = (e) => {
    const currentDur = e.duration;
    if (currentDur > 0) setDuration(currentDur);
    setProgress(e.currentTime);

    // 🔥 القفز التلقائي لنقطة التوقف بمجرد تحميل الفيديو
    if (!hasResumed && currentDur > 0 && resumeTime > 0) {
      const ratio = (resumeTime * 1000) / currentDur;
      // نمنع التخطي إذا كان التوقف في آخر 5% من الفيلم لكي لا ينتهي فجأة
      if (ratio > 0 && ratio < 0.95) {
        vlcRef.current.seek(ratio);
      }
      setHasResumed(true);
    }

    syncProgressWithSupabase(e);
  };

  const formatTime = (ms) => {
    if (isNaN(ms) || ms < 0) return "00:00";
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m < 10 ? '0'+m : m}:${s < 10 ? '0'+s : s}`;
  };

  const triggerControlsTimeout = () => {
    setShowControls(true);
    clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => setShowControls(false), 5000);
  };

  const skipForward = () => {
    if (duration > 0 && vlcRef.current) {
      vlcRef.current.seek(Math.min(1, (progress + 15000) / duration));
      triggerControlsTimeout();
    }
  };

  const skipBackward = () => {
    if (duration > 0 && vlcRef.current) {
      vlcRef.current.seek(Math.max(0, (progress - 15000) / duration));
      triggerControlsTimeout();
    }
  };

  const handleClosePlayer = () => {
    setVideoUrl(null);
    setVideoId(null);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={true} />
      
      <View style={[styles.webviewContainer, videoUrl ? styles.hidden : null]}>
        <WebView
          ref={webViewRef}
          source={{ uri: 'https://amjadalhajy2.github.io/iptv-iphone/' }} // ⬅️ تذكر وضع رابط صفحتك هنا
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowsInlineMediaPlayback={true}
          // 🔥 تفعيل السحب من جانب الشاشة للرجوع للخلف (تتوافق مع الايفون)
          allowsBackForwardNavigationGestures={true} 
          originWhitelist={['*']} 
          onMessage={handleMessageFromWeb}
          style={{ flex: 1, backgroundColor: '#0a0a0a' }}
        />
      </View>

      {videoUrl && (
        <View style={styles.playerContainer}>
          <TouchableOpacity activeOpacity={1} style={styles.videoTouchable} onPress={triggerControlsTimeout}>
            <VLCPlayer
              ref={vlcRef}
              style={styles.videoPlayer}
              videoAspectRatio="16:9"
              source={{ uri: videoUrl }}
              autoplay={true}
              paused={isPaused}
              resizeMode="contain"
              onProgress={onProgress}
              onEnd={handleClosePlayer}
              onError={handleClosePlayer}
            />
          </TouchableOpacity>

          {showControls && (
            <View style={styles.controlsOverlay} pointerEvents="box-none">
              <View style={styles.topControls}>
                <TouchableOpacity style={styles.closeBtn} onPress={handleClosePlayer}>
                  <Text style={styles.closeBtnText}>✕ إغلاق</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.centerControls} pointerEvents="box-none">
                <TouchableOpacity style={styles.skipBtn} onPress={skipBackward}>
                  <Text style={styles.skipIcon}>⏪</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.playBtn} onPress={() => { setIsPaused(!isPaused); triggerControlsTimeout(); }}>
                  <Text style={styles.playIcon}>{isPaused ? '▶' : '⏸'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.skipBtn} onPress={skipForward}>
                  <Text style={styles.skipIcon}>⏩</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.bottomControls}>
                <Text style={styles.timeText}>{formatTime(progress)}</Text>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${duration > 0 ? (progress / duration) * 100 : 0}%` }]} />
                </View>
                <Text style={styles.timeText}>{formatTime(duration)}</Text>
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  webviewContainer: { flex: 1 },
  hidden: { display: 'none' },
  playerContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', justifyContent: 'center' },
  videoTouchable: { flex: 1, width: '100%', height: '100%', justifyContent: 'center' },
  videoPlayer: { width: '100%', height: '100%' },
  
  controlsOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'space-between', backgroundColor: 'rgba(0,0,0,0.4)' },
  topControls: { flexDirection: 'row', justifyContent: 'flex-start', padding: 40, marginTop: 20 },
  closeBtn: { backgroundColor: 'rgba(229, 9, 20, 0.8)', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 25 },
  closeBtnText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  
  centerControls: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 40 },
  playBtn: { width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#FFF' },
  playIcon: { color: '#FFF', fontSize: 30, marginLeft: 4 },
  skipBtn: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  skipIcon: { color: '#FFF', fontSize: 20 },
  
  bottomControls: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 30, paddingBottom: 40, gap: 15 },
  timeText: { color: '#FFF', fontSize: 14, fontWeight: 'bold', width: 50, textAlign: 'center' },
  progressBarBg: { flex: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 3 },
  progressBarFill: { height: '100%', backgroundColor: '#e50914', borderRadius: 3 },
});
