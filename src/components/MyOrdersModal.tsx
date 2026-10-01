import React, { useState, useEffect } from 'react';
import {
  X,
  Search,
  Package,
  CheckCircle2,
  Clock,
  Truck,
  MapPin,
  AlertCircle,
  Copy,
  Check,
  Phone,
  MessageCircle,
  Calendar,
  ExternalLink,
  ChevronRight,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { doc, getDoc, getDocs, onSnapshot } from 'firebase/firestore';
import { db, ordersCollection } from '../lib/firebase';
import { Order, OrderStatus } from '../types';

interface MyOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialOrderId?: string;
}

const ORDER_STEPS: { status: OrderStatus; label: string; icon: any; description: string }[] = [
  {
    status: 'Order Placed',
    label: 'Order Placed',
    icon: CheckCircle2,
    description: 'Your request has been received & recorded'
  },
  {
    status: 'Processing',
    label: 'Processing',
    icon: Clock,
    description: 'Item packed & being prepped for dispatch'
  },
  {
    status: 'Shipped / Dispatched',
    label: 'Shipped / Dispatched',
    icon: Truck,
    description: 'Handed over to delivery agent / courier'
  },
  {
    status: 'Out for Delivery',
    label: 'Out for Delivery',
    icon: MapPin,
    description: 'Courier or technician is nearby'
  },
  {
    status: 'Delivered',
    label: 'Delivered',
    icon: CheckCircle2,
    description: 'Delivered safely to your doorstep'
  }
];

export default function MyOrdersModal({ isOpen, onClose, initialOrderId }: MyOrdersModalProps) {
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [copiedId, setCopiedId] = useState(false);
  const [recentOrders, setRecentOrders] = useState<string[]>([]);

  // Load recent order IDs from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('sachin_recent_orders');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) setRecentOrders(parsed.slice(0, 5));
      }
    } catch (e) {
      // ignore
    }
  }, [isOpen]);

  // When initialOrderId is passed or changes
  useEffect(() => {
    if (initialOrderId && isOpen) {
      setSearchInput(initialOrderId);
      handleLookup(initialOrderId);
    }
  }, [initialOrderId, isOpen]);

  // Subscribe to live updates on active order
  useEffect(() => {
    if (!activeOrder?.id) return;
    const cleanId = activeOrder.id.replace('#', '').trim();
    const orderDocRef = doc(db, 'orders', cleanId);
    const unsubscribe = onSnapshot(
      orderDocRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setActiveOrder({ ...data, id: cleanId, orderId: cleanId } as Order);
        }
      },
      (err) => {
        console.warn('Firestore active order live sync note:', err);
      }
    );

    return () => unsubscribe();
  }, [activeOrder?.id]);

  const stripHashAndTrim = (str: string) => {
    if (!str) return '';
    return str.toString().trim().replace(/^#+/, '').toUpperCase();
  };

  const normalizeOrderId = (input: string) => {
    return stripHashAndTrim(input);
  };

  const handleLookup = async (idToSearch?: string) => {
    const rawTarget = idToSearch !== undefined ? idToSearch : searchInput;
    const target = normalizeOrderId(rawTarget);

    if (!target) {
      setErrorMessage('Please enter an Order ID.');
      setActiveOrder(null);
      return;
    }

    setLoading(true);
    setErrorMessage('');
    setSearched(true);

    try {
      // 1. Try direct lookup in Cloud Firestore under orders/target
      const directDoc = await getDoc(doc(db, 'orders', target));

      if (directDoc.exists()) {
        const data = directDoc.data();
        const orderRecord = { id: target, orderId: target, formattedOrderId: `#${target}`, ...data } as Order;
        setActiveOrder(orderRecord);
        saveToRecentOrders(target);
        setLoading(false);
        return;
      }

      // If user typed 5-digit number without prefix (e.g. 45787), try with ORD- prefix
      if (!target.startsWith('ORD-') && /^\d+$/.test(target)) {
        const ordPrefixedDoc = await getDoc(doc(db, 'orders', `ORD-${target}`));
        if (ordPrefixedDoc.exists()) {
          const data = ordPrefixedDoc.data();
          const orderRecord = { id: `ORD-${target}`, orderId: `ORD-${target}`, formattedOrderId: `#ORD-${target}`, ...data } as Order;
          setActiveOrder(orderRecord);
          saveToRecentOrders(`ORD-${target}`);
          setLoading(false);
          return;
        }
      }

      // 2. Query all orders in Firestore to match case-insensitively, handling # prefix, orderId property, or phone
      const allOrdersSnap = await getDocs(ordersCollection);

      if (!allOrdersSnap.empty) {
        const foundDoc = allOrdersSnap.docs.find((d) => {
          const item = d.data();
          const kNorm = stripHashAndTrim(d.id);
          const ordIdNorm = stripHashAndTrim(item.orderId || '');
          const idNorm = stripHashAndTrim(item.id || '');
          const formattedNorm = stripHashAndTrim(item.formattedOrderId || '');
          const cleanPhone = (item.customerPhone || '').replace(/[^0-9]/g, '');
          const searchClean = target.replace(/[^0-9]/g, '');

          return (
            kNorm === target ||
            ordIdNorm === target ||
            idNorm === target ||
            formattedNorm === target ||
            kNorm === `ORD-${target}` ||
            ordIdNorm === `ORD-${target}` ||
            idNorm === `ORD-${target}` ||
            formattedNorm === `ORD-${target}` ||
            (target.startsWith('ORD-') && (kNorm === target.replace('ORD-', '') || ordIdNorm === target.replace('ORD-', ''))) ||
            (searchClean.length === 10 && cleanPhone.endsWith(searchClean))
          );
        });

        if (foundDoc) {
          const rawItem = foundDoc.data();
          const cleanId = stripHashAndTrim(rawItem.orderId || foundDoc.id);
          const matched = {
            id: foundDoc.id,
            orderId: cleanId,
            formattedOrderId: `#${cleanId}`,
            ...rawItem
          } as Order;
          setActiveOrder(matched);
          saveToRecentOrders(cleanId);
          setLoading(false);
          return;
        }
      }

      // If neither matches, show standard friendly message
      setActiveOrder(null);
      setErrorMessage('Invalid Order ID. Please check and try again.');
    } catch (err) {
      console.error('Error fetching order from Firestore:', err);
      setActiveOrder(null);
      setErrorMessage('Invalid Order ID. Please check and try again.');
    } finally {
      setLoading(false);
    }
  };

  const saveToRecentOrders = (id: string) => {
    try {
      const stored = localStorage.getItem('sachin_recent_orders');
      let list: string[] = stored ? JSON.parse(stored) : [];
      list = [id, ...list.filter((x) => x !== id)].slice(0, 5);
      localStorage.setItem('sachin_recent_orders', JSON.stringify(list));
      setRecentOrders(list);
    } catch (e) {
      // ignore
    }
  };

  const copyOrderId = (id: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const getStepStatus = (stepIndex: number, currentStatus: OrderStatus) => {
    const statusOrder: Record<string, number> = {
      'Order Placed': 0,
      'Processing': 1,
      'Shipped / Dispatched': 2,
      'Out for Delivery': 3,
      'Delivered': 4
    };

    if (currentStatus === 'Cancelled') {
      return 'cancelled';
    }

    const currentIdx = statusOrder[currentStatus] ?? 0;
    if (stepIndex < currentIdx) return 'completed';
    if (stepIndex === currentIdx) return 'current';
    return 'upcoming';
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-slate-900/70 backdrop-blur-md"
          onClick={onClose}
        />

        {/* Modal Dialog */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 15 }}
          transition={{ duration: 0.2 }}
          className="relative bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col my-auto max-h-[90vh] border border-slate-200 z-10"
        >
          {/* Header */}
          <div className="px-6 py-5 bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 text-white flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center shadow-inner">
                <Package className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-black tracking-tight flex items-center gap-2">
                  My Orders
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white uppercase tracking-wider">
                    Live Tracking
                  </span>
                </h3>
                <p className="text-xs text-blue-100 font-medium">
                  Track shipment status, estimated delivery & order updates
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Search Bar Section */}
          <div className="p-5 sm:p-6 bg-slate-50/70 border-b border-slate-200">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleLookup();
              }}
              className="flex flex-col sm:flex-row gap-2.5"
            >
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Enter Your Order ID (e.g., #ORD-45787 or ORD-45787)"
                  className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all shadow-sm uppercase"
                />
                {searchInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchInput('');
                      setActiveOrder(null);
                      setErrorMessage('');
                      setSearched(false);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={loading || !searchInput.trim()}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold text-sm transition-all shadow-md shadow-blue-500/20 active:scale-95 flex items-center justify-center gap-2 whitespace-nowrap"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Searching...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    <span>Track Order</span>
                  </>
                )}
              </button>
            </form>

            {/* Quick suggestions / recent orders */}
            {recentOrders.length > 0 && !activeOrder && (
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Recent Orders:
                </span>
                {recentOrders.map((recId) => (
                  <button
                    key={recId}
                    type="button"
                    onClick={() => {
                      setSearchInput(recId);
                      handleLookup(recId);
                    }}
                    className="text-xs font-semibold px-2.5 py-1 bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 hover:border-blue-300 rounded-lg transition-colors shadow-2xs"
                  >
                    #{recId}
                  </button>
                ))}
              </div>
            )}

            {/* Error Message */}
            {errorMessage && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-3.5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm font-semibold flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                <span>{errorMessage}</span>
              </motion.div>
            )}
          </div>

          {/* Modal Body / Tracking Details */}
          <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
            {activeOrder ? (
              <div className="space-y-6">
                {/* 1. Order ID & Status Header */}
                <div className="bg-slate-50 rounded-2xl p-4 sm:p-5 border border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Order ID
                      </span>
                      <button
                        type="button"
                        onClick={() => copyOrderId(activeOrder.orderId || activeOrder.id)}
                        className="inline-flex items-center gap-1 text-slate-500 hover:text-blue-600 text-xs transition-colors"
                        title="Copy Order ID"
                      >
                        {copiedId ? (
                          <span className="text-emerald-600 font-bold flex items-center gap-0.5">
                            <Check className="w-3 h-3" /> Copied
                          </span>
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                    <div className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-0.5">
                      #{activeOrder.orderId || activeOrder.id}
                    </div>
                    {activeOrder.createdAt && (
                      <div className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        Placed on {new Date(activeOrder.createdAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-start sm:items-end">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Current Status
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider shadow-xs ${
                        activeOrder.status === 'Delivered'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : activeOrder.status === 'Cancelled'
                          ? 'bg-red-100 text-red-800 border border-red-200'
                          : 'bg-blue-100 text-blue-800 border border-blue-200'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          activeOrder.status === 'Delivered'
                            ? 'bg-emerald-500'
                            : activeOrder.status === 'Cancelled'
                            ? 'bg-red-500'
                            : 'bg-blue-500 animate-pulse'
                        }`}
                      />
                      {activeOrder.status || 'Order Placed'}
                    </span>
                  </div>
                </div>

                {/* 2. Product Details Card */}
                <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-blue-600" />
                    Product & Pricing Details
                  </h4>
                  <div className="flex items-start sm:items-center gap-4">
                    <div className="w-20 h-20 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                      <img
                        src={
                          activeOrder.productImage ||
                          'https://placehold.co/200x200/1e293b/ffffff?text=Appliance'
                        }
                        alt={activeOrder.productName}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            'https://placehold.co/200x200/1e293b/ffffff?text=Appliance';
                        }}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      {activeOrder.productCategory && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-600 border border-blue-100 uppercase">
                          {activeOrder.productCategory}
                        </span>
                      )}
                      <h5 className="text-base font-bold text-slate-900 mt-1 truncate">
                        {activeOrder.productName}
                      </h5>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-600 flex-wrap">
                        <span>
                          Qty: <strong className="text-slate-900 font-bold">{activeOrder.quantity || 1}</strong>
                        </span>
                        <span>•</span>
                        <span>
                          Payment: <strong className="text-slate-900 font-bold uppercase">{activeOrder.paymentMethod || 'COD'}</strong>
                        </span>
                        {activeOrder.utrNumber && (
                          <>
                            <span>•</span>
                            <span className="text-blue-600 font-semibold">
                              UTR: {activeOrder.utrNumber}
                            </span>
                          </>
                        )}
                      </div>
                      {activeOrder.isExchange && (
                        <div className="mt-1.5 text-xs text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded inline-block">
                          Exchange Applied ({activeOrder.exchangeCondition || 'old appliance'}) - Saved ₹{activeOrder.exchangeDiscount || 0}
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[11px] text-slate-400 block font-semibold">Total Price</span>
                      <span className="text-xl font-black text-slate-900">
                        ₹{(activeOrder.totalPrice || activeOrder.price || 0).toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 3. Delivery Timeline & Shipping Status */}
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
                  <div className="flex items-center justify-between mb-5">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5 text-blue-600" />
                      Delivery Timeline & Shipping Status
                    </h4>
                    {activeOrder.estimatedDelivery && (
                      <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-blue-600" />
                        Est. Delivery: {activeOrder.estimatedDelivery}
                      </span>
                    )}
                  </div>

                  {/* Stepper */}
                  <div className="relative pl-6 sm:pl-8 space-y-6 before:absolute before:left-[11px] sm:before:left-[15px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                    {ORDER_STEPS.map((step, idx) => {
                      const stepState = getStepStatus(idx, activeOrder.status);
                      const isComplete = stepState === 'completed';
                      const isCurrent = stepState === 'current';

                      return (
                        <div key={step.status} className="relative flex items-start gap-4">
                          {/* Dot / Icon */}
                          <div
                            className={`absolute -left-6 sm:-left-8 w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all shadow-xs ${
                              isComplete
                                ? 'bg-emerald-600 text-white'
                                : isCurrent
                                ? 'bg-blue-600 text-white ring-4 ring-blue-100 animate-pulse'
                                : 'bg-slate-200 text-slate-500'
                            }`}
                          >
                            {isComplete ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : (
                              <span>{idx + 1}</span>
                            )}
                          </div>

                          {/* Content */}
                          <div className="flex-1">
                            <div className="flex items-center justify-between flex-wrap gap-1">
                              <h5
                                className={`text-sm font-bold ${
                                  isCurrent
                                    ? 'text-blue-600'
                                    : isComplete
                                    ? 'text-slate-900'
                                    : 'text-slate-400'
                                }`}
                              >
                                {step.label}
                              </h5>
                              {isCurrent && (
                                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                                  Current Stage
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {step.description}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 4. Estimated Delivery Duration Card */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50/60 rounded-2xl p-4 sm:p-5 border border-blue-100 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-500/20">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider block">
                        Estimated Delivery Time
                      </span>
                      <div className="text-base sm:text-lg font-black text-slate-900">
                        {activeOrder.estimatedDelivery || '2-3 Business Days (Expected Tomorrow)'}
                      </div>
                      <p className="text-xs text-slate-600">
                        Dispatch via Sachin Electronics local technician & courier team
                      </p>
                    </div>
                  </div>
                </div>

                {/* 5. Order Issues / Remarks / Support Notes */}
                {activeOrder.remarks && (
                  <div className="bg-amber-50 rounded-2xl p-4 sm:p-5 border border-amber-200">
                    <h4 className="text-xs font-black uppercase tracking-wider text-amber-800 flex items-center gap-1.5 mb-1.5">
                      <Info className="w-4 h-4 text-amber-600" />
                      Order Updates & Remarks
                    </h4>
                    <p className="text-xs sm:text-sm text-amber-900 font-medium whitespace-pre-wrap leading-relaxed">
                      {activeOrder.remarks}
                    </p>
                  </div>
                )}

                {/* 6. Customer & Destination Details */}
                <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 text-xs text-slate-600 space-y-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-blue-600" />
                    Delivery Destination
                  </h4>
                  <div className="font-bold text-sm text-slate-900">
                    {activeOrder.customerName}
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span>{activeOrder.customerPhone}</span>
                  </div>
                  <div className="flex items-start gap-2 text-slate-700">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <span className="whitespace-pre-wrap">{activeOrder.customerAddress}</span>
                  </div>
                </div>

                {/* 7. Need Help / Actions */}
                <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200">
                  <div className="text-xs text-slate-500 text-center sm:text-left">
                    Have queries about this order? Contact our support desk anytime.
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <a
                      href={`https://wa.me/918381892161?text=${encodeURIComponent(
                        `Hello Sachin Electronics, I need help with my Order #${activeOrder.orderId || activeOrder.id} (${activeOrder.productName}). Current status: ${activeOrder.status}.`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm active:scale-95"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>WhatsApp Support</span>
                    </a>
                    <a
                      href="tel:+918381892161"
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-all"
                    >
                      <Phone className="w-4 h-4 text-blue-600" />
                      <span>Call Support</span>
                    </a>
                  </div>
                </div>
              </div>
            ) : searched && !loading ? (
              <div className="text-center py-12 px-4 space-y-3">
                <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
                  <Package className="w-8 h-8" />
                </div>
                <h4 className="text-lg font-bold text-slate-800">No Order Found</h4>
                <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto">
                  We could not find an order matching &ldquo;<span className="font-bold text-slate-700">{searchInput}</span>&rdquo;. Please check the Order ID on your receipt or confirmation message.
                </p>
              </div>
            ) : (
              <div className="text-center py-10 px-4 space-y-4">
                <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
                  <Package className="w-8 h-8" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-900">Track Any Sachin Electronics Order</h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                    Enter your Order ID (such as <strong className="text-blue-600">ORD-83921</strong>) or your 10-digit registered phone number above to see live dispatch updates.
                  </p>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
