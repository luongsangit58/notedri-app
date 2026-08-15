import React, { useMemo, useState } from 'react';
import { View, StyleSheet, Modal, TouchableOpacity, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useColors } from '../utils/theme';
import { useT } from '../i18n';
import { LEAFLET_JS_B64, LEAFLET_CSS_B64 } from './leafletAssets';
import type { LatLng } from './RouteMap';

export type ColoredRoute = { points: LatLng[]; color: string };

/**
 * Biến thể của RouteMap cho "xem cả ngày" (đồng bộ web) - vẽ NHIỀU tuyến trên
 * cùng 1 bản đồ, mỗi tuyến 1 màu riêng, thay vì RouteMap chỉ vẽ được 1 tuyến.
 * Không sửa RouteMap gốc để khỏi ảnh hưởng các chỗ đang dùng nó (chi tiết 1 chuyến).
 */
function buildDayHtml(routes: ColoredRoute[], mapErrorText: string): string {
  const data = routes
    .filter((r) => r.points.length >= 2)
    .map((r) => ({ coords: r.points.map((p) => [p.lat, p.lng]), color: r.color }));
  const json = JSON.stringify(data);
  const fallback = data[0]?.coords[0] ?? [21.0278, 105.8342]; // Hanoi fallback

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="data:text/css;base64,${LEAFLET_CSS_B64}" />
  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; background: #0d1527; }
    .leaflet-control-attribution { font-size: 9px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="data:text/javascript;base64,${LEAFLET_JS_B64}"></script>
  <script>
    try {
      var routes = ${json};
      var map = L.map('map', { zoomControl: true, attributionControl: true });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; OpenStreetMap'
      }).addTo(map);

      var allBounds = null;
      routes.forEach(function (r) {
        var line = L.polyline(r.coords, { color: r.color, weight: 5, opacity: 0.85 }).addTo(map);
        L.circleMarker(r.coords[0], { radius: 6, color: '#fff', weight: 2, fillColor: r.color, fillOpacity: 1 }).addTo(map);
        allBounds = allBounds ? allBounds.extend(line.getBounds()) : line.getBounds();
      });
      if (allBounds) {
        map.fitBounds(allBounds, { padding: [30, 30] });
      } else {
        map.setView([${fallback[0]}, ${fallback[1]}], 13);
      }
    } catch (e) {
      document.getElementById('map').innerHTML =
        '<div style="color:#94a3b8;font-family:sans-serif;font-size:13px;text-align:center;padding-top:80px">' + ${JSON.stringify(mapErrorText)} + '</div>';
    }
  </script>
</body>
</html>`;
}

function DayMapWebView({ html, bgColor }: { html: string; bgColor: string }) {
  return (
    <WebView
      originWhitelist={['*']}
      source={{ html, baseUrl: 'https://notedri.com' }}
      style={{ flex: 1, backgroundColor: bgColor }}
      scrollEnabled={false}
      javaScriptEnabled
      domStorageEnabled
      cacheEnabled
      androidLayerType="hardware"
      mixedContentMode="always"
      setSupportMultipleWindows={false}
      startInLoadingState
    />
  );
}

// Rà soát 15/8 (góp ý user: bản đồ "xem cả ngày" chỉ có 240px cố định, không có
// cách nào xem to hơn) - thêm nút phóng to + Modal toàn màn hình, khớp đúng
// cơ chế RouteMap.tsx đã dùng cho bản đồ 1 chuyến (không sửa RouteMap gốc vì
// đây là component riêng cho nhiều tuyến/nhiều màu, xem comment đầu file).
export default function DayRouteMap({ routes, height = 260 }: { routes: ColoredRoute[]; height?: number }) {
  const colors = useColors();
  const t = useT();
  const mapErrorText = t('route_map.load_error');
  const html = useMemo(() => buildDayHtml(routes, mapErrorText), [routes, mapErrorText]);
  const [fullscreen, setFullscreen] = useState(false);

  return (
    <>
      <View style={[styles.wrap, { height, borderColor: colors.border }]}>
        <DayMapWebView html={html} bgColor={colors.background} />
        <TouchableOpacity
          onPress={() => setFullscreen(true)}
          style={styles.expandBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <FontAwesome5 name="expand-arrows-alt" size={13} color="#fff" />
        </TouchableOpacity>
      </View>

      <Modal visible={fullscreen} animationType="slide" statusBarTranslucent onRequestClose={() => setFullscreen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#0d1527' }} edges={['top', 'bottom']}>
          <DayMapWebView html={html} bgColor="#0d1527" />
          <TouchableOpacity onPress={() => setFullscreen(false)} style={styles.closeBtn}>
            <FontAwesome5 name="times" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 12, marginTop: 2 }}>{t('common.close')}</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  expandBtn: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 7,
    paddingHorizontal: 8, paddingVertical: 6,
  },
  closeBtn: {
    position: 'absolute', top: 56, right: 16,
    backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    alignItems: 'center',
  },
});
