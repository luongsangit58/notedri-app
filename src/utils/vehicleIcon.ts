// Icon FontAwesome5 theo loại xe. Backend trả `is_motorbike` (accessor).
export function vehicleIcon(vehicle: any): string {
  return vehicle?.is_motorbike ? 'motorcycle' : 'car-side';
}
