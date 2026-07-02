import 'react-native-url-polyfill/auto'; // ضروري جداً لعمل سوبابيس داخل التطبيق
import React, { useState, useRef } from 'react';
import { StyleSheet, View, SafeAreaView, StatusBar, TouchableOpacity, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { VLCPlayer } from 'react-native-vlc-media-player';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://kpfymvtyqbyjmlqfgujo.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_g7dHfpmPHcQwAWsO9FFuGw_4lG8fyLc'; // ضع مفتاح سوبابيس الخاص بك هنا
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 💡 هذا الكود السحري سيتم حقنه في صفحة الويب لكسر حماية الـ CORS واعتراض اتصالات IPTV
const injectedJS = `
  window.pendingFetches = {};
  
  window.handleProxyResponse = function(reqId, data, error) {
    if (window.pendingFetches[reqId]) {
      if (error) {
        window.pendingFetches[reqId].reject(new Error(error));
      } else {
        window.pendingFetches[reqId].resolve({
          ok: true,
          json: () => Promise.resolve(data)
        });
      }
      delete window.pendingFetches[reqId];
    }
  };

  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    const url = args[0];
    // إذا كان الاتصال يخص سيرفر IPTV، دعه يمر عبر تطبيق الآيفون لتخطي الحظر
    if (typeof url === 'string' && url.includes('player_api.php')) {
      return new Promise((resolve, reject) => {
        const reqId = Math.random().toString(36).substring(7);
        window.pendingFetches[reqId] = { resolve, reject };
        
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'PROXY_FETCH',
          url: url,
          reqId: reqId
        }));
      });
    }
    // بقية الاتصالات (مثل سوبابيس) تمر بشكل طبيعي
    return originalFetch(...args);
  };
  true;
`;

export default function App() {
  const [videoUrl, setVideoUrl] = useState(null);
  const [videoId, setVideoId] = useState(null);
  const [userId, setUserId] = useState(null);
  const webViewRef = useRef(null);

  const handleMessageFromWeb = async (event) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      
      // 1. أمر تشغيل الفيديو الأصلي (MKV)
      if (message.type === 'PLAY_VIDEO') {
        setVideoUrl(message.url);
        setVideoId(message.videoId);
        setUserId(message.userId);
      }
      
      // 2. أمر جلب البيانات من سيرفر الـ IPTV لتخطي حظر المتصفح
      if (message.type === 'PROXY_FETCH') {
        try {
          const response = await fetch(message.url);
          const json = await response.json();
          const script = \`window.handleProxyResponse('\${message.reqId}', \${JSON.stringify(json)}, null); true;\`;
          webViewRef.current.injectJavaScript(script);
        } catch (err) {
          const script = \`window.handleProxyResponse('\${message.reqId}', null, '\${err.message}'); true;\`;
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
          source={{ uri: 'https://amjadalhajy2.github.io/iptv-iphone/' }} // ⬅️ ضع رابط صفحتك هنا
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowsInlineMediaPlayback={true}
          originWhitelist={['*']} // ⬅️ مهم جداً للسماح بالاتصالات الخارجية
          injectedJavaScript={injectedJS}
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
