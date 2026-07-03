import 'react-native-url-polyfill/auto';
import React, { useState, useRef } from 'react';
import { StyleSheet, View, SafeAreaView, StatusBar, TouchableOpacity, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { VLCPlayer } from 'react-native-vlc-media-player';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://kpfymvtyqbyjmlqfgujo.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_g7dHfpmPHcQwAWsO9FFuGw_4lG8fyLc';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default function App() {
  const [videoUrl, setVideoUrl] = useState(null);
  const [videoId, setVideoId] = useState(null);
  const [userId, setUserId] = useState(null);
  const webViewRef = useRef(null);

  const handleMessageFromWeb = async (event) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      
      if (message.type === 'PLAY_VIDEO') {
        setVideoUrl(message.url);
        setVideoId(message.videoId);
        setUserId(message.userId);
      }
      
      if (message.type === 'PROXY_FETCH') {
        try {
          const response = await fetch(message.url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
              'Accept': 'application/json, text/plain, */*'
            }
          });
          
          if (!response.ok) throw new Error(`خطأ في السيرفر: ${response.status}`);
          const text = await response.text();
          
          // 🔥 النظام الجديد المنيع لنقل البيانات من التطبيق للويب
          const replyObj = { type: 'PROXY_RESPONSE', reqId: message.reqId, data: text, error: null };
          
          // التغليف المزدوج يمنع أي خطأ برمجي مهما كان الرد يحتوي على رموز غريبة
          const script = `
            if(window.handleNativeMessage) {
              window.handleNativeMessage({ data: ${JSON.stringify(JSON.stringify(replyObj))} });
            }
            true;
          `;
          webViewRef.current.injectJavaScript(script);

        } catch (err) {
          const replyObj = { type: 'PROXY_RESPONSE', reqId: message.reqId, data: null, error: err.message || 'فشل الاتصال بالسيرفر' };
          const script = `
            if(window.handleNativeMessage) {
              window.handleNativeMessage({ data: ${JSON.stringify(JSON.stringify(replyObj))} });
            }
            true;
          `;
          webViewRef.current.injectJavaScript(script);
        }
      }
    } catch (error) {
      console.error("Bridge Error:", error);
    }
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

  const handleClosePlayer = () => {
    setVideoUrl(null);
    setVideoId(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#121212" />
      
      {!videoUrl ? (
        <WebView
          ref={webViewRef}
          source={{ uri: 'https://amjadalhajy2.github.io/iptv-iphone/' }} // ⬅️ تذكر وضع رابط صفحتك هنا
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowsInlineMediaPlayback={true}
          originWhitelist={['*']} 
          onMessage={handleMessageFromWeb}
          style={styles.webview}
        />
      ) : (
        <View style={styles.playerContainer}>
          <VLCPlayer
            style={styles.videoPlayer}
            videoAspectRatio="16:9"
            source={{ uri: videoUrl }}
            autoplay={true}
            resizeMode="contain"
            onProgress={(e) => syncProgressWithSupabase(e)}
            onEnd={handleClosePlayer}
            onError={handleClosePlayer}
          />
          <TouchableOpacity style={styles.closeButton} onPress={handleClosePlayer}>
            <Text style={styles.closeButtonText}>✕ إغلاق الفيديو</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  webview: { flex: 1 },
  playerContainer: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  videoPlayer: { width: '100%', height: '100%' },
  closeButton: { position: 'absolute', top: 40, right: 20, backgroundColor: 'rgba(0, 0, 0, 0.7)', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 20, borderWidth: 1, borderBottomColor: '#333' },
  closeButtonText: { color: '#FFF', fontSize: 14, fontWeight: 'bold' }
});
