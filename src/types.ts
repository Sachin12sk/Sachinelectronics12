export interface Product {
  id?: string;
  name: string;
  category: string;
  price: number;
  image: string;
  description: string;
}

export interface Complaint {
  id?: string;
  jobCardId?: string;
  name: string;
  phone: string;
  mobile?: string;
  pincode?: string;
  address: string;
  product: string;
  device?: string;
  appliance?: string;
  issue: string;
  issueImageUrl?: string;
  priority?: 'Normal' | 'Urgent';
  timeslot?: string;
  status: 'Pending' | 'Assigned' | 'Resolved' | 'In Progress' | 'Completed' | 'COMPLETED' | 'Ready for Delivery' | 'Pending - Part Required' | 'On Hold' | string;
  createdAt: string;
  reason?: string; // ISO string
  technicianRemark?: string;
  statusUpdates?: {
    status: string;
    note: string;
    timestamp: string;
  }[];
  resolutionDetails?: {
    replacedPartName: string;
    oldPartPhoto: string;
    newPartPhoto: string;
    oldPartLocation?: string;
    newPartLocation?: string;
    totalCost: number;
    serialNumber?: string;
    warrantyDays?: number;
    resolutionDate?: string;
    paymentStatus?: 'Paid' | 'Pending';
    paymentMethod?: 'Cash' | 'Online / UPI / QR';
    utrNumber?: string;
    paymentScreenshotUrl?: string;
  };
  assignedTechnicianId?: string;
  assignedTechnicianName?: string;
  assignedAreaAdminId?: string;
  assignedAreaAdminName?: string;
}

export interface Technician {
  baseSalary?: number;
  id?: string;
  name: string;
  phone: string;
  mobile?: string;
  loginId?: string;
  password?: string;
  isActive: boolean;
  active?: boolean;
  skills?: string[];
  pincodes?: string[];
  areaAdminId?: string;
  assignedCount?: number;
}

export interface BannerSettings {
  text: string;
  isActive: boolean;
  type: 'offer' | 'emergency' | 'discount';
}

export interface InventoryItem {
  id?: string;
  category: string;
  partName: string;
  stockQuantity: number;
  costPrice: number;
  sellingPrice: number;
}

export interface Promotion {
  id?: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  isActive: boolean;
  order: number;
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': any;
    }
  }
}

export interface TechnicianApplication {
  id?: string;
  fullName: string;
  mobile: string;
  whatsapp: string;
  city: string;
  experience: number;
  skills: string[];
  documents: {
    aadhaarFront?: string;
    aadhaarBack?: string;
    pan?: string;
    dl?: string;
    photo?: string;
  };
  status: 'Pending' | 'Approved' | 'Rejected' | 'Hold' | 'APPROVED' | 'REJECTED' | 'ON_HOLD' | 'approved' | 'rejected' | 'on_hold';
  createdAt: string;
}


export interface AreaAdmin {
  id?: string;
  name: string;
  loginId?: string;
  phone: string;
  email: string;
  password?: string;
  passwordHash?: string;
  passwordSalt?: string;
  pincodes: string[];
  assignedPincodes?: string[];
  isActive: boolean;
  permissions: {
    canEditInventory: boolean;
    canAlertTechs: boolean;
    canWA: boolean;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface CustomerLoyalty {
  id?: string;
  phone: string;
  coins: number;
  bookingsCount: number;
}

export type UserRole = 'super_admin' | 'area_admin' | 'technician' | 'admin';

export interface ServiceRate {
  id?: string;
  applianceCategory: string;
  serviceType: string;
  baseRepairingCost: number;
}

export type OrderStatus =
  | 'Order Placed'
  | 'Processing'
  | 'Shipped / Dispatched'
  | 'Out for Delivery'
  | 'Delivered'
  | 'Cancelled'
  | 'Pending'
  | 'Confirmed'
  | 'Dispatched';

export interface OrderTimelineEvent {
  status: OrderStatus;
  timestamp: string;
  note?: string;
}

export interface Order {
  id: string; // e.g. ORD-83921
  orderId: string; // e.g. ORD-83921
  formattedOrderId?: string; // e.g. #ORD-83921
  productName: string;
  productImage?: string;
  productCategory?: string;
  quantity: number;
  price: number;
  totalPrice: number;
  exchangeDiscount?: number;
  isExchange?: boolean;
  exchangeCondition?: 'working' | 'non-working' | 'scrap' | 'none' | string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  pincode?: string;
  paymentMethod: 'upi' | 'card' | 'cod' | string;
  utrNumber?: string;
  paymentScreenshotUrl?: string;
  status: OrderStatus;
  statusTimeline?: OrderTimelineEvent[];
  estimatedDelivery?: string;
  remarks?: string;
  assignedAreaAdminId?: string;
  serialNumber?: string;
  warrantyInfo?: {
    serialNumber: string;
    warrantyMonths: number;
    warrantyExpiryDate: string;
    activatedAt?: string;
    note?: string;
  };
  createdAt: string;
  updatedAt?: string;
}
