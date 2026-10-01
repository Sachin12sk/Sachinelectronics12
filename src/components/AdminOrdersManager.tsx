import React, { useState, useEffect } from 'react';
import { onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, ordersCollection } from '../lib/firebase';
import { Order, OrderStatus } from '../types';
import {
  Package,
  Search,
  Truck,
  Clock,
  CheckCircle2,
  Calendar,
  Phone,
  MapPin,
  MessageCircle,
  ExternalLink,
  Edit3,
  Trash2,
  AlertCircle,
  ChevronDown
} from 'lucide-react';

interface AdminOrdersManagerProps {
  allowedPincodes?: string[];
  userRole?: 'super_admin' | 'area_admin';
}

const ORDER_STATUS_LIST: OrderStatus[] = [
  'Pending',
  'Confirmed',
  'Dispatched',
  'Order Placed',
  'Processing',
  'Shipped / Dispatched',
  'Out for Delivery',
  'Delivered',
  'Cancelled'
];

export default function AdminOrdersManager({ allowedPincodes, userRole = 'super_admin' }: AdminOrdersManagerProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Edit modal / inline editing
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [editStatus, setEditStatus] = useState<OrderStatus>('Order Placed');
  const [editEstimatedDelivery, setEditEstimatedDelivery] = useState('');
  const [editRemarks, setEditRemarks] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      ordersCollection,
      (snapshot) => {
        if (!snapshot.empty) {
          const list: Order[] = snapshot.docs.map((d) => {
            const data = d.data();
            return {
              ...data,
              id: d.id,
              orderId: data.orderId || d.id
            };
          }) as Order[];

          // Sort by createdAt descending
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

  // Filtered orders
  const filteredOrders = orders.filter((ord) => {
    // Area Admin pincode filter
    if (allowedPincodes && allowedPincodes.length > 0 && ord.pincode) {
      if (!allowedPincodes.includes(ord.pincode)) {
        return false;
      }
    }

    // Status filter
    if (statusFilter !== 'All' && ord.status !== statusFilter) {
      return false;
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchId = (ord.orderId || ord.id || '').toLowerCase().includes(q);
      const matchName = (ord.customerName || '').toLowerCase().includes(q);
      const matchPhone = (ord.customerPhone || '').toLowerCase().includes(q);
      const matchProd = (ord.productName || '').toLowerCase().includes(q);
      return matchId || matchName || matchPhone || matchProd;
    }

    return true;
  });

  const handleOpenEdit = (order: Order) => {
    setEditingOrder(order);
    setEditStatus(order.status || 'Order Placed');
    setEditEstimatedDelivery(order.estimatedDelivery || 'Tomorrow by 6:00 PM');
    setEditRemarks(order.remarks || '');
  };

  const handleSaveOrderUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrder) return;

    setIsSaving(true);
    try {
      const newTimeline = editingOrder.statusTimeline ? [...editingOrder.statusTimeline] : [];
      if (editingOrder.status !== editStatus) {
        newTimeline.push({
          status: editStatus,
          timestamp: new Date().toISOString(),
          note: editRemarks ? `Status changed to ${editStatus}: ${editRemarks}` : `Status changed to ${editStatus}`
        });
      }

      await updateDoc(doc(db, 'orders', editingOrder.id), {
        status: editStatus,
        estimatedDelivery: editEstimatedDelivery,
        remarks: editRemarks,
        statusTimeline: newTimeline,
        updatedAt: new Date().toISOString()
      });

      setEditingOrder(null);
    } catch (err: any) {
      console.error('Error updating order:', err);
      alert('Failed to update order: ' + (err?.message || 'Error'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (!window.confirm(`Are you sure you want to delete order #${orderId}? This cannot be undone.`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'orders', orderId));
    } catch (err: any) {
      console.error('Error deleting order:', err);
      alert('Failed to delete order: ' + (err?.message || 'Error'));
    }
  };

  const handleSendWhatsAppUpdate = (order: Order) => {
    const rawPhone = (order.customerPhone || '').replace(/[^0-9]/g, '');
    const cleanPhone = rawPhone.length === 10 ? `91${rawPhone}` : rawPhone;

    const message = `Hello ${order.customerName},\n\nUpdate regarding your Sachin Electronics Order *#${order.orderId || order.id}*:\n\n*Product:* ${order.productName}\n*Current Status:* ${order.status}\n*Estimated Delivery:* ${order.estimatedDelivery || 'Soon'}\n*Remarks / Update:* ${order.remarks || 'Order is progressing as scheduled.'}\n\nYou can track live updates anytime on our portal with your Order ID #${order.orderId || order.id}.\n\nThank you,\nSachin Electronics Team\n+91 83818 92161`;

    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-600" />
            Customer Product Orders ({filteredOrders.length})
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Manage live shipping stages, delivery timelines, custom updates & WhatsApp alerts
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="All">All Statuses ({orders.length})</option>
            {ORDER_STATUS_LIST.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>

          {/* Search bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by ID, Name, Phone..."
              className="pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-blue-500 w-48 sm:w-64"
            />
          </div>
        </div>
      </div>

      {/* Orders List */}
      {loading ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-600">Loading orders...</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-3">
            <Package className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-slate-800">No orders found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
            {searchQuery || statusFilter !== 'All'
              ? 'Try adjusting your filters or search query.'
              : 'Orders placed by customers in the Shop will appear here with live tracking.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredOrders.map((ord) => {
            const isCompleted = ord.status === 'Delivered';
            const isCancelled = ord.status === 'Cancelled';

            return (
              <div
                key={ord.id}
                className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:border-slate-300 transition-all flex flex-col lg:flex-row gap-5 justify-between items-start lg:items-center"
              >
                {/* Left: Product & Order Info */}
                <div className="flex items-start gap-4 flex-1">
                  <div className="w-20 h-20 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                    <img
                      src={ord.productImage || 'https://placehold.co/200x200/1e293b/ffffff?text=Product'}
                      alt={ord.productName}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://placehold.co/200x200/1e293b/ffffff?text=Product';
                      }}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base font-black text-slate-900">#{ord.orderId || ord.id}</span>
                      <span
                        className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${
                          isCompleted
                            ? 'bg-emerald-100 text-emerald-800'
                            : isCancelled
                            ? 'bg-red-100 text-red-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {ord.status}
                      </span>
                      {ord.paymentMethod && (
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                          {ord.paymentMethod}
                        </span>
                      )}
                    </div>

                    <h4 className="text-sm font-bold text-slate-800">{ord.productName}</h4>

                    <div className="text-xs text-slate-500 flex items-center gap-3 flex-wrap">
                      <span>
                        Total: <strong className="text-slate-900 font-bold">₹{(ord.totalPrice || ord.price || 0).toLocaleString('en-IN')}</strong>
                      </span>
                      <span>•</span>
                      <span>
                        Qty: <strong>{ord.quantity || 1}</strong>
                      </span>
                      {ord.createdAt && (
                        <>
                          <span>•</span>
                          <span>
                            {new Date(ord.createdAt).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Customer Info */}
                    <div className="pt-1 text-xs text-slate-600 flex items-center gap-3 flex-wrap">
                      <span className="font-semibold text-slate-900">{ord.customerName}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3 text-slate-400" />
                        {ord.customerPhone}
                      </span>
                      {ord.pincode && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1 font-mono text-blue-600">
                            PIN: {ord.pincode}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Remarks / Support Notes Preview */}
                    {ord.remarks && (
                      <div className="text-[11px] text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 mt-1 max-w-xl">
                        <strong>Note:</strong> {ord.remarks}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-end border-t lg:border-t-0 pt-3 lg:pt-0">
                  {/* WhatsApp Notification Button */}
                  <button
                    type="button"
                    onClick={() => handleSendWhatsAppUpdate(ord)}
                    className="inline-flex items-center gap-1 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded-xl transition-colors border border-emerald-200"
                    title="Send WhatsApp update to customer"
                  >
                    <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                    <span>WhatsApp Update</span>
                  </button>

                  {/* Edit status & timeline */}
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(ord)}
                    className="inline-flex items-center gap-1 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Update Status</span>
                  </button>

                  {/* Delete button (Super Admin only) */}
                  {userRole === 'super_admin' && (
                    <button
                      type="button"
                      onClick={() => handleDeleteOrder(ord.id)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                      title="Delete Order"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Order Modal */}
      {editingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className="p-5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold">Update Order Status</h3>
                <p className="text-xs text-blue-100">Order #{editingOrder.orderId || editingOrder.id}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingOrder(null)}
                className="p-1 rounded-full text-white/80 hover:text-white hover:bg-white/10"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveOrderUpdate} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Shipping Status Stepper
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as OrderStatus)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  {ORDER_STATUS_LIST.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Estimated Delivery Time
                </label>
                <input
                  type="text"
                  value={editEstimatedDelivery}
                  onChange={(e) => setEditEstimatedDelivery(e.target.value)}
                  placeholder="e.g. Tomorrow by 6:00 PM, or 2-3 business days"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Support Remarks / Tracking Notes
                </label>
                <textarea
                  rows={3}
                  value={editRemarks}
                  onChange={(e) => setEditRemarks(e.target.value)}
                  placeholder="Enter courier info, technician assigned, delays or custom update for customer..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingOrder(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : 'Save & Publish Update'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
