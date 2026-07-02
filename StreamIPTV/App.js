import React, { useState, useRef } from 'react';
import { StyleSheet, View, SafeAreaView, StatusBar, TouchableOpacity, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { VLCPlayer } from 'react-native-vlc-media-player';
import { createClient } from '@supabase/supabase-js';

// 1. إعداد الاتصال بـ Supabase من جانب التطبيق المدمج للمزامنة أثناء تشغيل الفيديو
const SUPABASE_URL = 'https://kpfymvtyqbyjmlqfgujo.supabase.co'; // استبدله برابط مشروعك
const SUPABASE_ANON_KEY = 'sb_publishable_g7dHfpmPHcQwAWsO9FFuGw_4lG8fyLc'; // استبدله بمفتاح مشروعك
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default function App() {
  const [videoUrl, setVideoUrl] = useState(null);
  const [videoId, setVideoId] = useState(null);
  const [userId, setUserId] = useState(null);
  const webViewRef = useRef(null);

  // 2. الاستماع للرسائل القادمة من صفحة الويب المرفوعة على جيت هب
  const handleMessageFromWeb = async (event) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      
      // إذا أرسل الموقع أمر تشغيل فيديو
      if (message.type === 'PLAY_VIDEO') {
        setVideoUrl(message.url);
        setVideoId(message.videoId);
        setUserId(message.userId); // معرف المستخدم لربط المزامنة بحسابه
      }
    } catch (error) {
      console.error("خطأ في قراءة البيانات القادمة من الموقع:", error);
    }
  };

  // 3. دالة المزامنة المستمرة مع Supabase أثناء تشغيل الفيديو (تحديث التقدم)
  const syncProgressWithSupabase = async (playbackData) => {
    if (!videoId || !userId) return;

    // حساب الوقت الحالي بالثواني
    const currentTimeInSeconds = Math.floor(playbackData.currentTime / 1000);
    const totalDurationInSeconds = Math.floor(playbackData.duration / 1000);

    if (currentTimeInSeconds <= 0) return;

    // إرسال التقدم إلى جدول المتابعة في Supabase (تحديث أو إنشاء)
    const { error } = await supabase
      .from('watch_history') // تأكد من إنشاء جدول بهذا الاسم في سوبابيس
      .upsert({ 
        user_id: userId, 
        video_id: videoId, 
        last_position: currentTimeInSeconds, 
        total_duration: totalDurationInSeconds,
        updated_at: new Date()
      }, { onConflict: 'user_id,video_id' });

    if (error) {
      console.error("فشلت المزامنة مع سوبابيس:", error.message);
    }
  };

  const handleClosePlayer = () => {
    setVideoUrl(null);
    setVideoId(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#121212" />
      
      {/* العرض الشرطي: إذا لم يكن هناك فيديو يعمل، اعرض واجهة الويب من جيت هب */}
      {!videoUrl ? (
        <WebView
          ref={webViewRef}
          // ↙️ ضع هنا رابط صفحة الويب الخاصة بك المرفوعة على GitHub Pages
          source={{ uri: 'https://amjadalhajy2.github.io/iptv-iphone/' }} 
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowsInlineMediaPlayback={true}
          onMessage={handleMessageFromWeb} // ربط الجسر لاستقبال الأوامر
          style={styles.webview}
        />
      ) : (
        /* إذا أرسل الموقع رابط فيديو، اخفِ الويب وافتح مشغل VLC الأصلي لدعم MKV */
        <View style={styles.playerContainer}>
          <VLCPlayer
            style={styles.videoPlayer}
            videoAspectRatio="16:9"
            source={{ uri: videoUrl }}
            autoplay={true}
            resizeMode="contain"
            onProgress={(e) => {
              // هذا الحدث يعمل تلقائياً كل ثانية أثناء تشغيل الفيديو ليقوم بالمزامنة
              syncProgressWithSupabase(e);
            }}
            onEnd={handleClosePlayer}
            onError={(e) => {
              console.error("خطأ في مشغل VLC:", e);
              handleClosePlayer();
            }}
          />
          
          {/* زر عائم لإغلاق المشغل والعودة لواجهة الويب */}
          <TouchableOpacity style={styles.closeButton} onPress={handleClosePlayer}>
            <Text style={styles.closeButtonText}>✕ إغلاق الفيديو</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  webview: {
    flex: 1,
  },
  playerContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoPlayer: {
    width: '100%',
    height: '100%',
  },
  closeButton: {
    position: 'absolute',
    top: 40,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
    borderWidth: 1,
    borderBottomColor: '#333',
  },
  closeButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
