import type {
  DeliveryStatus,
  PaymentMethod,
  RouteStatus,
  ShiftStatus,
  VehicleType,
} from './types';

// תוויות עברית לערכי enum מהסכימה. משותפות כדי ששתי האפליקציות יקראו
// לאותו דבר באותו שם — שליח שרשם "קטנוע" יראה "קטנוע" גם אצל בעל העסק.

export const VEHICLE_LABELS: Record<VehicleType, string> = {
  motorcycle: 'אופנוע',
  scooter: 'קטנוע',
  car: 'רכב',
  bicycle: 'אופניים',
};

export const SHIFT_STATUS_LABELS: Record<ShiftStatus, string> = {
  pending: 'ממתין לאישור',
  active: 'במשמרת',
  ended: 'הסתיימה',
  rejected: 'נדחתה',
};

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'מזומן',
  card_online: 'שולם באשראי',
  card_on_delivery: 'אשראי בדלת',
};

export const ROUTE_STATUS_LABELS: Record<RouteStatus, string> = {
  draft: 'טיוטה',
  offered: 'נשלח לשליח',
  dispatched: 'בדרך',
  completed: 'הושלם',
  cancelled: 'בוטל',
};

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  new: 'בהכנה',
  ready: 'מוכן לאיסוף',
  assigned: 'שובץ למסלול',
  picked_up: 'בדרך',
  delivered: 'נמסר',
  cancelled: 'בוטל',
};
