import 'react-native-url-polyfill/auto';
import React, { useState, useRef } from 'react';
import { StyleSheet, View, SafeAreaView, StatusBar, TouchableOpacity, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { VLCPlayer } from 'react-native-vlc-media-player';
import { createClient } from '@supabase/supabase-js';
import ReactNativeBlobUtil from 'react-native-blob-util'; // 🔥 المكتبة الجديدة

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
          // 🔥 الهجوم النهائي: استخدام محرك جديد يتجاهل أخطاء شهادات SSL/TLS المعطوبة
          const response = await ReactNativeBlobUtil.config({
            trusty: true // هذا السطر السحري يكسر حماية TLS و SSL تماماً
          }).fetch('GET', message.url, {
            'User-Agent': 'VLC/3.0.0',
            'Accept': '*/*'
          });
          
          const text = response.text();
          const safeData = encodeURIComponent(text).replace(/'/g, "%27");
          
          const script = `
            if(window.pendingFetches && window.pendingFetches['${message.reqId}']) {
               try {
                  var decoded = decodeURIComponent('${safeData}');
                  var parsed = JSON.parse(decoded);
                  window.pendingFetches['${message.reqId}'].resolve(parsed);
               } catch(e) {
                  alert("خطأ: السيرفر أرسل بيانات غير مفهومة.");
                  window.pendingFetches['${message.reqId}'].reject(e);
               }
               delete window.pendingFetches['${message.reqId}'];
            }
            true;
          `;
          webViewRef.current.injectJavaScript(script);

        } catch (err) {
          const script = `
            alert("فشل الاتصال: ${err.message}");
            if(window.pendingFetches && window.pendingFetches['${message.reqId}']) {
               window.pendingFetches['${message.reqId}'].reject(new Error("${err.message}"));
               delete window.pendingFetches['${message.reqId}'];
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
