import React, { useState, useEffect } from 'react';
import { onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db, ordersCollection } from '../../lib/firebase';
import { Order, OrderStatus } from '../../types';
import {
  Package,
  Search,
  MessageCircle,
  Phone,
  MapPin,
  Calendar,
  CheckCircle2,
  Clock,
  Truck,
  Filter,
  ExternalLink,
  ChevronDown
} from 'lucide-react';

interface ProductBookingRequestsProps {
  allowedPincodes?: string[];
}

const STATUS_OPTIONS: { value: OrderStatus; label: string; badgeClass: string }[] = [
  { value: 'Pending', label: 'Pending', badgeClass: 'bg-amber-100 text-amber-800 border-amber-200' },
  { value: 'Confirmed', label: 'Confirmed', badgeClass: 'bg-blue-100 text-blue-800 border-blue-200' },
  { value: 'Dispatched', label: 'Dispatched', badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  { value: 'Delivered', label: 'Delivered', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { value: 'Cancelled', label: 'Cancelled', badgeClass: 'bg-rose-100 text-rose-800 border-rose-200' }
];

export default function ProductBookingRequests({ allowedPincodes }: ProductBookingRequestsProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [updatedNotice, setUpdatedNotice] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      ordersCollection,
      (snapshot) => {
        if (!snapshot.empty) {
          const list: Order[] = snapshot.docs.map((d) => {
            const item = d.data();
            const cleanId = (item.orderId || d.id).replace(/^#+/, '');
            return {
              ...item,
              id: d.id,
              orderId: cleanId,
              formattedOrderId: item.formattedOrderId || `#${cleanId}`
            } as Order;
          });

          // Sort by booking date (newest first)
          list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
          setOrders(list);
        } else {
          setOrders([]);
        }
        setLoading(false);
      },
      (error) => {
        console.warn('Firestore orders sync note:', error);
        setOrders([]);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Normalize order status to match our 5 primary dropdown options
  const normalizeStatus = (rawStatus: string): string => {
    if (!rawStatus) return 'Pending';
    const s = rawStatus.toLowerCase();
    if (s.includes('place') || s.includes('pend')) return 'Pending';
    if (s.includes('process') || s.includes('confirm')) return 'Confirmed';
    if (s.includes('dispatch') || s.includes('ship') || s.includes('out')) return 'Dispatched';
    if (s.includes('deliver')) return 'Delivered';
    if (s.includes('cancel')) return 'Cancelled';
    return rawStatus;
  };

  const handleStatusChange = async (order: Order, newStatus: string) => {
    const docId = order.id || (order.orderId || '').replace(/^#+/, '');
    setUpdatingId(docId);
    try {
      const updatedTimeline = Array.isArray(order.statusTimeline) ? [...order.statusTimeline] : [];
      updatedTimeline.push({
        status: newStatus as OrderStatus,
        timestamp: new Date().toISOString(),
        note: `Status updated to ${newStatus} by Administrator.`
      });

      await updateDoc(doc(db, 'orders', docId), {
        status: newStatus,
        updatedAt: new Date().toISOString(),
        statusTimeline: updatedTimeline
      });

      setUpdatedNotice(`Updated #${docId} to ${newStatus}`);
      setTimeout(() => setUpdatedNotice(null), 3000);
    } catch (err: any) {
      console.error('Failed to update order status:', err);
      alert('Failed to update order status: ' + (err?.message || 'Error'));
    } finally {
      setUpdatingId(null);
    }
  };

  const handleWhatsAppCustomer = (order: Order) => {
    let phone = (order.customerPhone || '').replace(/[^0-9]/g, '');
    if (phone.length === 10) {
      phone = '91' + phone;
    }
    if (!phone) {
      alert('No valid customer phone number found for this order.');
      return;
    }

    const currentStatus = normalizeStatus(order.status);
    let statusNote = '';
    if (currentStatus === 'Confirmed') {
      statusNote = 'Your order is confirmed and currently being packed for transit.';
    } else if (currentStatus === 'Dispatched') {
      statusNote = 'Your order has been dispatched and is on its way to your delivery address!';
    } else if (currentStatus === 'Delivered') {
      statusNote = 'Your package has been successfully delivered. Please inspect and keep the 360° unboxing video.';
    } else if (currentStatus === 'Cancelled') {
      statusNote = 'Your order request has been cancelled. For queries, reply to this message.';
    } else {
      statusNote = 'We have received your product request and are preparing dispatch.';
    }

    const message = 
`Hello ${order.customerName || 'Customer'},
Greetings from *Sachin Electricals & Electronics*!

📌 *Update on your Order:* #${order.orderId || order.id}
• *Product:* ${order.productName}
• *Amount:* ₹${(order.totalPrice || order.price || 0).toLocaleString('en-IN')}
• *Current Status:* *${currentStatus.toUpperCase()}*

ℹ️ ${statusNote}

Track live order status online on our portal anytime using Order ID #${order.orderId || order.id}.
Let us know if you have any questions!`;

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  // Filter orders
  const filteredOrders = orders.filter((ord) => {
    // Area Admin pincode filter
    if (allowedPincodes && allowedPincodes.length > 0 && ord.pincode) {
      if (!allowedPincodes.includes(ord.pincode)) {
        return false;
      }
    }

    // Status filter
    if (statusFilter !== 'All') {
      const norm = normalizeStatus(ord.status);
      if (norm !== statusFilter) {
        return false;
      }
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().replace(/^#+/, '');
      const matchId = (ord.orderId || ord.id || '').toLowerCase().includes(q);
      const matchName = (ord.customerName || '').toLowerCase().includes(q);
      const matchPhone = (ord.customerPhone || '').replace(/[^0-9]/g, '').includes(q);
      const matchProd = (ord.productName || '').toLowerCase().includes(q);
      const matchAddress = (ord.customerAddress || '').toLowerCase().includes(q);
      return matchId || matchName || matchPhone || matchProd || matchAddress;
    }

    return true;
  });

  return (
    <div className="mt-12 bg-white/80 backdrop-blur-xl rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="p-6 bg-gradient-to-r from-blue-50/80 via-indigo-50/50 to-white border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                Product Booking & Order Requests
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
                  {orders.length} Total
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Manage live customer bookings, update dispatch states, and send instant WhatsApp status messages.
              </p>
            </div>
          </div>
        </div>

        {/* Search & Status Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {updatedNotice && (
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg animate-pulse">
              ✓ {updatedNotice}
            </span>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by ID, name, phone, product..."
              className="pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-blue-500 w-56 sm:w-72 shadow-sm"
            />
          </div>

          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm text-xs font-semibold">
            {['All', 'Pending', 'Confirmed', 'Dispatched', 'Delivered', 'Cancelled'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  statusFilter === st
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs font-bold text-slate-500">Loading live product requests...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Package className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-700">No product booking requests found</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {searchQuery || statusFilter !== 'All'
                ? 'Try resetting your search query or status filter.'
                : 'Customer bookings from the Shop catalog will automatically appear here in real-time.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-black uppercase text-slate-500 tracking-wider">
                <th className="px-5 py-3.5">Order ID & Date</th>
                <th className="px-5 py-3.5">Customer & Delivery Details</th>
                <th className="px-5 py-3.5">Product & Price</th>
                <th className="px-5 py-3.5">Current Status</th>
                <th className="px-5 py-3.5 text-right">WhatsApp Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredOrders.map((ord) => {
                const cleanId = (ord.orderId || ord.id).replace(/^#+/, '');
                const currentStatus = normalizeStatus(ord.status);
                const isUpdating = updatingId === cleanId;

                return (
                  <tr key={ord.id} className="hover:bg-slate-50/60 transition-colors">
                    {/* 1. Order ID & Booking Date */}
                    <td className="px-5 py-4 align-top">
                      <div className="font-black text-slate-900 font-mono text-sm flex items-center gap-1.5">
                        <span className="text-blue-600 font-bold">#</span>
                        {cleanId}
                      </div>
                      <div className="text-xs text-slate-500 flex items-center gap-1 mt-1 font-medium">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {ord.createdAt
                          ? new Date(ord.createdAt).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })
                          : 'Recent'}
                      </div>
                      {ord.paymentMethod && (
                        <div className="mt-1.5">
                          <span className="inline-block text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                            {ord.paymentMethod}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* 2. Customer Name, Phone & Address */}
                    <td className="px-5 py-4 align-top">
                      <div className="font-bold text-slate-900 text-sm">{ord.customerName}</div>
                      <a
                        href={`tel:${ord.customerPhone}`}
                        className="text-xs text-blue-600 font-semibold hover:underline flex items-center gap-1 mt-0.5"
                      >
                        <Phone className="w-3 h-3 text-slate-400" />
                        {ord.customerPhone}
                      </a>
                      <div className="text-xs text-slate-600 flex items-start gap-1 mt-1.5 max-w-xs leading-relaxed">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <span>
                          {ord.customerAddress}
                          {ord.pincode && (
                            <strong className="block text-slate-800 font-semibold mt-0.5">
                              PIN: {ord.pincode}
                            </strong>
                          )}
                        </span>
                      </div>
                    </td>

                    {/* 3. Product Name & Price */}
                    <td className="px-5 py-4 align-top">
                      <div className="flex items-center gap-3">
                        {ord.productImage && (
                          <img
                            src={ord.productImage}
                            alt={ord.productName}
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'https://placehold.co/100x100/1e293b/ffffff?text=Product';
                            }}
                            className="w-12 h-12 rounded-lg object-cover bg-slate-100 border border-slate-200 shrink-0"
                          />
                        )}
                        <div>
                          <div className="font-bold text-slate-900 text-sm line-clamp-1">{ord.productName}</div>
                          <div className="text-xs font-black text-blue-600 mt-0.5">
                            ₹{(ord.totalPrice || ord.price || 0).toLocaleString('en-IN')}
                          </div>
                          {ord.isExchange && (
                            <span className="inline-block text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 mt-1">
                              Exchange ({ord.exchangeCondition || 'Active'})
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* 4. Current Status Dropdown */}
                    <td className="px-5 py-4 align-top">
                      <div className="relative inline-block w-40">
                        <select
                          value={currentStatus}
                          disabled={isUpdating}
                          onChange={(e) => handleStatusChange(ord, e.target.value)}
                          className={`w-full appearance-none pl-3 pr-8 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            currentStatus === 'Delivered'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : currentStatus === 'Cancelled'
                              ? 'bg-rose-50 text-rose-800 border-rose-300'
                              : currentStatus === 'Dispatched'
                              ? 'bg-indigo-50 text-indigo-800 border-indigo-300'
                              : currentStatus === 'Confirmed'
                              ? 'bg-blue-50 text-blue-800 border-blue-300'
                              : 'bg-amber-50 text-amber-800 border-amber-300'
                          } ${isUpdating ? 'opacity-50 cursor-wait' : ''}`}
                        >
                          {STATUS_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="w-4 h-4 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                      {isUpdating && (
                        <p className="text-[10px] font-bold text-blue-600 mt-1 animate-pulse">Updating status...</p>
                      )}
                    </td>

                    {/* 5. WhatsApp Customer Button */}
                    <td className="px-5 py-4 align-top text-right">
                      <button
                        type="button"
                        onClick={() => handleWhatsAppCustomer(ord)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm shadow-emerald-500/20 active:scale-95 whitespace-nowrap"
                        title="Chat with Customer on WhatsApp"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>WhatsApp Customer</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
