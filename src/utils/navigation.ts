/**
 * Parses a web URL (from notification.url or suggestion.cta.url) and navigates
 * to the corresponding mobile screen.
 *
 * Web URL patterns → mobile screen mapping:
 *   /vehicles/{id}/reminders    → Reminders
 *   /vehicles/{id}/health       → Health
 *   /vehicles/{id}/odometer     → OdometerList
 *   /vehicles/{id}/services/guide → GarageGuide
 *   /vehicles/{id}/services     → Services tab
 *   /vehicles/{id}/refuels      → RefuelsList or AddRefuel
 *   /services/create            → AddService
 *   /services/guide             → GarageGuide
 *   /refuels/create             → AddRefuel
 */
export function navigateFromUrl(navigation: any, url: string, vehicleId?: number): void {
  if (!url) return;

  const vehicleMatch = url.match(/vehicles\/(\d+)/);
  const vid = vehicleMatch ? parseInt(vehicleMatch[1], 10) : vehicleId;

  if (url.includes('/services/guide') || url.includes('services.guide')) {
    navigation.navigate('GarageGuide');
  } else if (url.includes('/health')) {
    navigation.navigate('Health');
  } else if (url.includes('/reminders')) {
    navigation.navigate('Reminders', vid ? { vehicleId: vid } : undefined);
  } else if (url.includes('/odometer')) {
    navigation.navigate('OdometerList', vid ? { vehicleId: vid } : undefined);
  } else if (url.includes('/services/create') || url.includes('services.create')) {
    navigation.navigate('AddService', vid ? { vehicleId: vid } : undefined);
  } else if (url.includes('/services')) {
    navigation.navigate('Services');
  } else if (url.includes('/refuels/create') || url.includes('refuels.create')) {
    navigation.navigate('AddRefuel', vid ? { vehicleId: vid } : undefined);
  } else if (url.includes('/refuels')) {
    navigation.navigate('RefuelsList', vid ? { vehicleId: vid } : undefined);
  } else if (url.includes('/dossier') || url.includes('dossier')) {
    navigation.navigate('Dossier', vid ? { vehicleId: vid } : undefined);
  }
}

/**
 * Handles suggestion CTA objects from the API. CTAs may carry either a web
 * `url` (routed via navigateFromUrl) or a native `action` key for screens
 * that have no web equivalent.
 *
 * Native actions:
 *   obd_dtc   → OBD DTC list for the given vehicle
 */
export function navigateFromCta(
  navigation: any,
  cta: { url?: string; action?: string },
  vehicleId?: number,
): void {
  if (cta.action) {
    switch (cta.action) {
      case 'obd_dtc':
        navigation.navigate('OBDTrips', vehicleId ? { vehicleId } : undefined);
        return;
      default:
        break;
    }
  }
  if (cta.url) {
    navigateFromUrl(navigation, cta.url, vehicleId);
  }
}
