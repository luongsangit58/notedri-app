import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useColors } from '../utils/theme';
import { useT } from '../i18n';
import { LEAFLET_JS_B64, LEAFLET_CSS_B64 } from './leafletAssets';

export type LatLng = { lat: number; lng: number };

interface Props {
  points: LatLng[];
  height?: number;
  /** Live mode keeps the last point centered and shows a pulsing marker */
  live?: boolean;
}

function buildHtml(points: LatLng[], live: boolean, mapErrorText: string): string {
  const coords = points.map((p) => [p.lat, p.lng]);
  const json = JSON.stringify(coords);
  const last = coords.length ? coords[coords.length - 1] : [21.0278, 105.8342]; // Hanoi fallback

  // Leaflet nhúng sẵn (data URI) -> không phụ thuộc CDN. Tile vẫn từ OSM (cần mạng);
  // nếu tile lỗi (offline) thì đường đi vẫn vẽ trên nền trống.
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
      var coords = ${json};
      var map = L.map('map', { zoomControl: true, attributionControl: true });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; OpenStreetMap'
      }).addTo(map);

      if (coords.length >= 2) {
        var line = L.polyline(coords, { color: '#2563EB', weight: 5, opacity: 0.85 }).addTo(map);
        map.fitBounds(line.getBounds(), { padding: [30, 30] });
        L.circleMarker(coords[0], { radius: 7, color: '#22c55e', fillColor: '#22c55e', fillOpacity: 1 }).addTo(map);
        L.circleMarker(coords[coords.length - 1], { radius: 7, color: '#ef4444', fillColor: '#ef4444', fillOpacity: 1 }).addTo(map);
      } else if (coords.length === 1) {
        map.setView(coords[0], 16);
        L.circleMarker(coords[0], { radius: 8, color: '#2563EB', fillColor: '#2563EB', fillOpacity: 1 }).addTo(map);
      } else {
        map.setView([${last[0]}, ${last[1]}], 13);
      }
      ${live ? "if (coords.length) { map.setView(coords[coords.length-1], 16); }" : ''}
    } catch (e) {
      document.getElementById('map').innerHTML =
        '<div style="color:#94a3b8;font-family:sans-serif;font-size:13px;text-align:center;padding-top:80px">' + ${JSON.stringify(mapErrorText)} + '</div>';
    }
  </script>
</body>
</html>`;
}

function MapWebView({ html, bgColor, textColor }: { html: string; bgColor: string; textColor: string }) {
  const t = useT();
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
      renderLoading={() => (
        <View style={[styles.loading, { backgroundColor: bgColor }]}>
          <Text style={{ color: textColor, fontSize: 12 }}>{t('route_map.loading')}</Text>
        </View>
      )}
    />
  );
}

export default function RouteMap({ points, height = 240, live = false }: Props) {
  const colors = useColors();
  const t = useT();
  const mapErrorText = t('route_map.load_error');
  const html = useMemo(() => buildHtml(points, live, mapErrorText), [points, live, mapErrorText]);
  const [fullscreen, setFullscreen] = useState(false);

  return (
    <>
      <View style={[styles.wrap, { height, borderColor: colors.border }]}>
        <MapWebView html={html} bgColor={colors.background} textColor={colors.textSecondary} />
        <TouchableOpacity
          onPress={() => setFullscreen(true)}
          style={styles.expandBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <FontAwesome5 name="expand-arrows-alt" size={13} color="#fff" />
        </TouchableOpacity>
      </View>

      <Modal visible={fullscreen} animationType="slide" onRequestClose={() => setFullscreen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#0d1527' }} edges={['top', 'bottom']}>
          <MapWebView html={html} bgColor="#0d1527" textColor="#94a3b8" />
          <TouchableOpacity
            onPress={() => setFullscreen(false)}
            style={styles.closeBtn}>
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
  loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
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
