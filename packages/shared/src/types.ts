// טיפוסים משותפים שמשקפים את הסכימה ב-supabase/migrations/0001_schema.sql.
// כל שינוי סכימה דורש עדכון מקביל כאן.

export type UUID = string;
export type ISODateString = string;

export interface Business {
  business_id: UUID;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  batch_max_size: number;
  batch_max_wait_minutes: number;
  created_at: ISODateString;
}

export type BusinessMemberRole = 'owner' | 'dispatcher';

export interface BusinessMember {
  user_id: UUID;
  business_id: UUID;
  role: BusinessMemberRole;
}

export type VehicleType = 'motorcycle' | 'scooter' | 'car' | 'bicycle';

export interface Courier {
  courier_id: UUID;
  name: string;
  phone: string;
  vehicle_type: VehicleType;
  last_lat: number | null;
  last_lng: number | null;
  last_location_at: ISODateString | null;
  created_at: ISODateString;
}

export type ShiftStatus = 'pending' | 'active' | 'ended' | 'rejected';

export interface Shift {
  shift_id: UUID;
  courier_id: UUID;
  business_id: UUID;
  status: ShiftStatus;
  invited_at: ISODateString;
  accepted_at: ISODateString | null;
  ended_at: ISODateString | null;
}

// צורות ה-embed של PostgREST. שם המפתח הוא שם הטבלה המקושרת, לא היחיד.
export interface ShiftWithCourier extends Shift {
  couriers: Pick<Courier, 'courier_id' | 'name' | 'phone' | 'vehicle_type'> | null;
}

export interface ShiftWithBusiness extends Shift {
  businesses: Pick<Business, 'business_id' | 'name' | 'address' | 'phone'> | null;
}

export type GeocodeStatus = 'pending' | 'ok' | 'failed' | 'manual';
export type PaymentMethod = 'cash' | 'card_online' | 'card_on_delivery';
export type DeliveryStatus =
  | 'new'
  | 'ready'
  | 'assigned'
  | 'picked_up'
  | 'delivered'
  | 'cancelled';

export interface Delivery {
  delivery_id: UUID;
  business_id: UUID;
  order_details: string | null;
  customer_name: string | null;
  customer_phone: string;
  address: string;
  address_note: string | null;
  lat: number | null;
  lng: number | null;
  geocode_status: GeocodeStatus;
  price_agorot: number;
  payment_method: PaymentMethod;
  paid: boolean;
  status: DeliveryStatus;
  created_at: ISODateString;
  ready_at: ISODateString | null;
  picked_up_at: ISODateString | null;
  delivered_at: ISODateString | null;
}

export type RouteStatus = 'draft' | 'offered' | 'dispatched' | 'completed' | 'cancelled';

export interface Route {
  route_id: UUID;
  business_id: UUID;
  courier_id: UUID | null;
  status: RouteStatus;
  estimated_duration_seconds: number | null;
  created_at: ISODateString;
  dispatched_at: ISODateString | null;
  completed_at: ISODateString | null;
}

export interface RouteStop {
  route_id: UUID;
  delivery_id: UUID;
  sequence: number;
  eta: ISODateString | null;
}

// צורות ה-embed של מסלול. `route_stops` מגיעות עם המשלוח המקושר,
// כי בלי הכתובת אין מה להציג — והסדר (`sequence`) הוא כל המוצר.
export interface RouteStopWithDelivery extends RouteStop {
  deliveries: Delivery | null;
}

export interface RouteWithStops extends Route {
  route_stops: RouteStopWithDelivery[];
  couriers: Pick<Courier, 'courier_id' | 'name' | 'phone'> | null;
}

// ═══════════════ RPCs ═══════════════

export type UserRole = 'business' | 'courier' | null;

// תואם את הפונקציה me() ב-supabase/migrations/0003_triggers.sql
export interface Me {
  user_id: UUID;
  role: UserRole;
  business: Business | null;
  courier: Courier | null;
}

// תואם את find_courier_by_phone() — התאמה מדויקת בלבד, אין רשימת שליחים
export interface FindCourierResult {
  courier_id: UUID;
  name: string;
  phone: string;
}
