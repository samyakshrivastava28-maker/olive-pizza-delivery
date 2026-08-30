export type OrderStatus =
  | 'pending'
  | 'pending_acceptance'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'partner_assigned'
  | 'out_for_delivery'
  | 'delivered'
  | 'completed'
  | 'cancelled'
  | 'rejected'
  | 'failed';

export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  size?: string;
  crust?: string;
}

export interface DeliveryAddress {
  addressLine?: string;
  address?: string;
  city?: string;
  landmark?: string;
  lat?: number;
  lng?: number;
  contactName?: string;
  contactPhone?: string;
}

export interface DeliveryOrder {
  id: string;
  orderNumber?: string | number;
  dailyOrderNumber?: number;
  userId: string;
  customerName?: string;
  contactPhone: string;
  deliveryAddress: DeliveryAddress | string;
  items: OrderItem[];
  totalAmount: number;
  deliveryFee: number;
  paymentMethod?: 'COD' | 'ONLINE' | 'UPI' | string;
  paymentStatus?: 'PAID' | 'PENDING' | string;
  status: OrderStatus;
  orderSource?: string;
  fulfillment?: string;
  branchId?: string;
  branchName?: string;
  deliveryPartnerId?: string;
  deliveryPartnerName?: string;
  createdAt: string;
  updatedAt?: string;
  acceptedAt?: string;
  pickedUpAt?: string;
  deliveredAt?: string;
  deliveryDistanceKm?: number;
  deliveryDurationMin?: number;
  location?: { lat: number; lng: number };
  proofOfDelivery?: {
    proofImageUrl?: string | null;
    signatureUrl?: string | null;
    notes?: string;
    completedAt?: string;
  };
}

export interface RiderShiftStats {
  assigned: number;
  completed: number;
  active: number;
  cancelled: number;
  totalDistanceKm: number;
  averageDeliveryTimeMin: number;
  earnings: number;
  date: string;
}

export interface MonthlyDeliverySummary {
  id: string;
  riderId: string;
  monthKey: string; // e.g. "2026-08"
  year: number;
  month: number;
  monthName: string;
  totalDeliveries: number;
  completedDeliveries: number;
  cancelledDeliveries: number;
  declinedDeliveries: number;
  totalDistanceKm: number;
  averageDeliveryTimeMin: number;
  totalEarnings: number;
  onTimeRatePercent: number;
  organizationId?: string;
  franchiseId?: string;
  branchId?: string;
  generatedAt: string;
  isPurgeEligible?: boolean;
}

export interface RiderProfile {
  uid: string;
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  vehicleType?: string;
  vehicleNumber?: string;
  organizationId?: string;
  franchiseId?: string;
  branchId: string;
  branchName: string;
  branchAddress?: string;
  branchPhone?: string;
  isOnline: boolean;
  workingSchedule: Array<{ day: string; hours: string; isOff: boolean }>;
  joiningDate?: string;
  emergencyContact?: { name: string; phone: string };
  rating?: number;
  totalDeliveriesLifetime?: number;
}