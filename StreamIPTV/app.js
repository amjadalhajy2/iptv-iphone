import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, View, BackHandler, TouchableOpacity, Text, SafeAreaView, StatusBar } from 'react-native';
import { WebView } from 'react-native-webview';
import { VLCPlayer } from 'react-native-vlc-media-player';

// ضع رابط صفحة الويب المرفوعة على GitHub Pages أو Netlify هنا
const WEB_URL = 'https://your-website-url.com'; 

export default function App() {
  const webViewRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [resumeTime, setResumeTime] = useState(0);

  // استقبال أوامر التشغيل من صفحة الويب
  const handleMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.action === 'play') {
        setVideoUrl(data.url);
        setResumeTime(data.resumeTime || 0);
        setIsPlaying(true);
      }
    } catch (e) {
      console.log('Error parsing message: ', e);
    }
  };

  // إرسال وقت المشاهدة إلى الواجهة لحفظه في قاعدة البيانات
  const handleVideoProgress = (event) => {
    if (event.currentTime > 0 && Math.floor(event.currentTime / 1000) % 15 === 0) {
      const seconds = Math.floor(event.currentTime / 1000);
      webViewRef.current?.injectJavaScript(`window.updateProgressFromNative(${seconds}); true;`);
    }
  };

  const closePlayer = () => {
    setIsPlaying(false);
    setVideoUrl('');
  };

  const handleVideoEnd = () => {
    closePlayer();
    webViewRef.current?.injectJavaScript(`window.onVideoEnded(); true;`);
  };

  // التعامل مع زر الرجوع الفعلي
  useEffect(() => {
    const backAction = () => {
      if (isPlaying) {
        closePlayer();
        return true;
      }
      return false;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [isPlaying]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar hidden={true} />
      
      {!isPlaying && (
        <WebView
          ref={webViewRef}
          source={{ uri: WEB_URL }}
          style={styles.webview}
          onMessage={handleMessage}
          allowsInlineMediaPlayback={true}
          scrollEnabled={false}
          bounces={false}
        />
      )}

      {isPlaying && (
        <View style={styles.playerContainer}>
          <VLCPlayer
            style={styles.video}
            videoAspectRatio="16:9"
            source={{ uri: videoUrl }}
            onProgress={handleVideoProgress}
            onEnd={handleVideoEnd}
            autoAspectRatio={true}
            resume={resumeTime}
          />
          <TouchableOpacity style={styles.closeButton} onPress={closePlayer}>
            <Text style={styles.closeButtonText}>إغلاق ✕</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  webview: { flex: 1, backgroundColor: '#000' },
  playerContainer: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  video: { width: '100%', height: '100%' },
  closeButton: {
    position: 'absolute', top: 30, right: 30, backgroundColor: 'rgba(229, 9, 20, 0.8)',
    paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, borderWidth: 1, borderColor: '#fff'
  },
  closeButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});