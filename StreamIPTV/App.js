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
        
        // دالة مساعدة لإرسال البيانات الناجحة للصفحة
        const sendSuccess = (text) => {
          const safeData = encodeURIComponent(text).replace(/'/g, "%27");
          const script = `
            if(window.pendingFetches && window.pendingFetches['${message.reqId}']) {
               try {
                  var decoded = decodeURIComponent('${safeData}');
                  var parsed = JSON.parse(decoded);
                  window.pendingFetches['${message.reqId}'].resolve(parsed);
               } catch(e) {
                  alert("خطأ: البيانات المستلمة من السيرفر غير صالحة.");
                  window.pendingFetches['${message.reqId}'].reject(e);
               }
               delete window.pendingFetches['${message.reqId}'];
            }
            true;
          `;
          webViewRef.current.injectJavaScript(script);
        };

        // دالة مساعدة لإرسال رسالة الخطأ للصفحة
        const sendError = (errMsg) => {
          const script = `
            alert("فشل الاتصال: ${errMsg}");
            if(window.pendingFetches && window.pendingFetches['${message.reqId}']) {
               window.pendingFetches['${message.reqId}'].reject(new Error("${errMsg}"));
               delete window.pendingFetches['${message.reqId}'];
            }
            true;
          `;
          webViewRef.current.injectJavaScript(script);
        };

        try {
          // 🚀 المحاولة الأولى: الاتصال المباشر مع تزوير الهوية (لتخطي حظر السيرفرات)
          const response = await fetch(message.url, {
            headers: {
              'User-Agent': 'IPTVSmartersPro', 
              'Accept': 'application/json'
            }
          });
          
          if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
          const text = await response.text();
          sendSuccess(text);

        } catch (primaryError) {
          console.log("Direct connection failed, trying Proxy...", primaryError.message);
          
          try {
            // 🛡️ المحاولة الثانية (الخطة البديلة): استخدام نفق سحابي عالمي لتخطي حظر مزود الإنترنت وحماية آبل
            // نضيف رمزاً عشوائياً (Date.now) لمنع الكاش (البيانات القديمة)
            const nocacheUrl = message.url + (message.url.includes('?') ? '&' : '?') + 'r=' + Date.now();
            const proxyUrl = "https://api.allorigins.win/raw?url=" + encodeURIComponent(nocacheUrl);

            const proxyResponse = await fetch(proxyUrl);
            if (!proxyResponse.ok) throw new Error(`Proxy HTTP Error: ${proxyResponse.status}`);
            
            const text = await proxyResponse.text();
            sendSuccess(text);

          } catch (proxyError) {
            // إذا فشل النفق السحابي أيضاً، فهذا يعني يقيناً أن السيرفر متوقف من المصدر أو الرابط خاطئ
            sendError(`السيرفر لا يعمل أو الرابط خاطئ تماماً. التفاصيل: ${primaryError.message}`);
          }
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
          source={{ uri: 'https://amjadalhajy2.github.io/iptv-iphone/' }} // ⬅️ تذكر رابط صفحتك هنا
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
