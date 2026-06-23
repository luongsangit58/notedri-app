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
export function navigateFromUrl(navigation: any, url: string): void {
  if (!url) return;

  const vehicleMatch = url.match(/vehicles\/(\d+)/);
  const vehicleId = vehicleMatch ? parseInt(vehicleMatch[1], 10) : undefined;

  if (url.includes('/services/guide') || url.includes('services.guide')) {
    navigation.navigate('GarageGuide');
  } else if (url.includes('/health')) {
    navigation.navigate('Health');
  } else if (url.includes('/reminders')) {
    navigation.navigate('Reminders', vehicleId ? { vehicleId } : undefined);
  } else if (url.includes('/odometer')) {
    navigation.navigate('OdometerList', vehicleId ? { vehicleId } : undefined);
  } else if (url.includes('/services/create') || url.includes('services.create')) {
    navigation.navigate('AddService', vehicleId ? { vehicleId } : undefined);
  } else if (url.includes('/services')) {
    navigation.navigate('Services');
  } else if (url.includes('/refuels/create') || url.includes('refuels.create')) {
    navigation.navigate('AddRefuel', vehicleId ? { vehicleId } : undefined);
  } else if (url.includes('/refuels')) {
    navigation.navigate('RefuelsList', vehicleId ? { vehicleId } : undefined);
  } else if (url.includes('/dossier') || url.includes('dossier')) {
    navigation.navigate('Dossier', vehicleId ? { vehicleId } : undefined);
  }
}
