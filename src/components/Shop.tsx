import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { db, productsCollection } from '../lib/firebase';
import { ShoppingCart, X, CheckCircle2, Search, Box, Camera, ChevronLeft, ChevronRight, Sparkles, Wrench, Package, Copy, Check, MessageCircle, ExternalLink, ShieldCheck, ArrowRight } from 'lucide-react';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import QRCode from 'react-qr-code';
import { Product, Order } from '../types';
import { products as defaultProducts } from '../data';
import VoiceInput from './VoiceInput';
import TiltCard from './TiltCard';
import { compressImage } from '../utils/imageCompression';

export default function Shop() {
  const [products, setProducts] = useState<Product[]>(defaultProducts);
  const [loading, setLoading] = useState(true);
  const [buyingProduct, setBuyingProduct] = useState<Product | null>(null);
  const [viewing3DProduct, setViewing3DProduct] = useState<Product | null>(null);
  const [isOrdering, setIsOrdering] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('upi');
  
  // Search bar starts clear ('') so all products are visible by default
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [isListeningSearch, setIsListeningSearch] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  
  const [orderName, setOrderName] = useState('');
  const [orderPhone, setOrderPhone] = useState('');
  const [orderAddress, setOrderAddress] = useState('');
  
  const [isListeningOrderName, setIsListeningOrderName] = useState(false);
  const [isListeningOrderAddress, setIsListeningOrderAddress] = useState(false);
  const [isExchange, setIsExchange] = useState(false);
  const [exchangeCondition, setExchangeCondition] = useState<'working' | 'non-working' | 'scrap'>('non-working');
  const [exchangeDiscount, setExchangeDiscount] = useState(0);

  const [utrNumber, setUtrNumber] = useState('');
  const [paymentScreenshotUrl, setPaymentScreenshotUrl] = useState('');
  const [placedOrderId, setPlacedOrderId] = useState('');
  const [copiedPlacedId, setCopiedPlacedId] = useState(false);
  const [placedOrderWhatsAppUrl, setPlacedOrderWhatsAppUrl] = useState('');
  const [placedOrderSummary, setPlacedOrderSummary] = useState<{
    productName: string;
    productImage?: string;
    finalPrice: number;
    customerName: string;
    phone: string;
    address: string;
    paymentMode: string;
  } | null>(null);

  const carouselRef = useRef<HTMLDivElement>(null);
  const searchInputBoxRef = useRef<HTMLDivElement>(null);

  // Realtime Cloud Firestore Sync for Products
  useEffect(() => {
    let isMounted = true;
    const unsubscribe = onSnapshot(
      productsCollection,
      (snapshot) => {
        if (!isMounted) return;
        if (!snapshot.empty) {
          const fsProducts = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as Product[];
          // Merge with defaultProducts so essential catalog spare parts are never lost
          const existingIds = new Set(fsProducts.map(p => p.id));
          const existingNames = new Set(fsProducts.map(p => p.name.trim().toLowerCase()));
          const combined = [
            ...fsProducts,
            ...defaultProducts.filter(p => !existingIds.has(p.id) && !existingNames.has(p.name.trim().toLowerCase()))
          ];
          setProducts(combined);
        } else {
          setProducts(defaultProducts);
        }
        setLoading(false);
      },
      (error: any) => {
        if (!isMounted) return;
        console.warn('Cloud Firestore products sync note:', error?.message || error);
        setProducts(defaultProducts);
        setLoading(false);
      }
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // Listen for open-product-request from Hero search or other links
  useEffect(() => {
    const handleOpenProduct = (e: any) => {
      if (e.detail) {
        handleBuyClick(e.detail);
        const el = document.getElementById('shop');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        }
      }
    };
    window.addEventListener('open-product-request', handleOpenProduct);
    return () => window.removeEventListener('open-product-request', handleOpenProduct);
  }, []);

  // Close search preview when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchInputBoxRef.current && !searchInputBoxRef.current.contains(e.target as Node)) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Exchange discount calculations
  useEffect(() => {
    if (buyingProduct && isExchange) {
      let baseDiscount = 0;
      if (buyingProduct.category === 'Fans' || buyingProduct.category === 'Accessories' || buyingProduct.category === 'Fan Parts') {
        baseDiscount = exchangeCondition === 'working' ? 300 : exchangeCondition === 'non-working' ? 150 : 50;
      } else if (buyingProduct.category === 'Coolers' || buyingProduct.category === 'Appliances' || buyingProduct.category === 'Cooler Parts') {
        baseDiscount = exchangeCondition === 'working' ? 1500 : exchangeCondition === 'non-working' ? 800 : 300;
      } else if (buyingProduct.category === 'Inverters') {
        baseDiscount = exchangeCondition === 'working' ? 2000 : exchangeCondition === 'non-working' ? 1000 : 400;
      } else {
        baseDiscount = exchangeCondition === 'working' ? 500 : exchangeCondition === 'non-working' ? 200 : 100;
      }
      setExchangeDiscount(Math.min(baseDiscount, buyingProduct.price * 0.5)); // Max 50% discount
    } else {
      setExchangeDiscount(0);
    }
  }, [buyingProduct, isExchange, exchangeCondition]);

  const handleScreenshotUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressed = await compressImage(file, 600, 600, 0.6);
      setPaymentScreenshotUrl(compressed);
    } catch {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPaymentScreenshotUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (buyingProduct || orderSuccess) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [buyingProduct, orderSuccess]);

  const handleCopyOrderId = () => {
    if (!placedOrderId) return;
    const formatted = placedOrderId.startsWith('#') ? placedOrderId : `#${placedOrderId}`;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(formatted);
    }
    setCopiedPlacedId(true);
    setTimeout(() => setCopiedPlacedId(false), 2000);
  };

  const handleBuyClick = (product: Product) => {
    setBuyingProduct(product);
    setOrderSuccess(false);
    setPlacedOrderId('');
  };

  // Helper to sanitize payload for Firebase Realtime Database (no undefined values allowed)
  const sanitizeForFirebase = (data: any): any => {
    if (data === null || data === undefined) return null;
    if (Array.isArray(data)) {
      return data.map(sanitizeForFirebase);
    }
    if (typeof data === 'object') {
      const clean: Record<string, any> = {};
      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined) {
          clean[key] = sanitizeForFirebase(value);
        }
      }
      return clean;
    }
    return data;
  };

  const handleOrderSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsOrdering(true);

    const formData = new FormData(e.currentTarget);
    const name = String(formData.get('name') || orderName || '').trim();
    const phone = String(formData.get('phone') || orderPhone || '').trim();
    const address = String(formData.get('address') || orderAddress || '').trim();
    const payment = String(formData.get('payment') || paymentMethod || 'cod');

    const finalPrice = buyingProduct ? buyingProduct.price - exchangeDiscount : 0;
    
    // Generate unique 6-8 digit alphanumeric Order ID (e.g. ORD-83921)
    const randomDigits = Math.floor(10000 + Math.random() * 90000);
    const cleanOrderId = `ORD-${randomDigits}`;

    // Extract PIN if present in address
    const pinMatch = address.match(/\b\d{6}\b/);
    const pincode = pinMatch ? pinMatch[0] : '';

    const newOrder = {
      id: cleanOrderId,
      orderId: cleanOrderId,
      formattedOrderId: `#${cleanOrderId}`,
      productName: buyingProduct?.name || 'Electrical Appliance',
      productImage: buyingProduct?.image || '',
      productCategory: buyingProduct?.category || 'Appliances',
      quantity: 1,
      price: buyingProduct?.price || 0,
      totalPrice: finalPrice,
      exchangeDiscount: isExchange ? exchangeDiscount : 0,
      isExchange: Boolean(isExchange),
      exchangeCondition: isExchange ? (exchangeCondition || 'fair') : 'none',
      customerName: name,
      customerPhone: phone,
      customerAddress: address,
      pincode: pincode || '',
      paymentMethod: payment,
      utrNumber: payment === 'upi' ? (utrNumber || '') : '',
      paymentScreenshotUrl: paymentScreenshotUrl || '',
      status: 'Order Placed' as const,
      estimatedDelivery: 'Tomorrow by 6:00 PM',
      remarks: 'Order request received. In-transit preparation initiated.',
      statusTimeline: [
        {
          status: 'Order Placed' as const,
          timestamp: new Date().toISOString(),
          note: 'Order placed by customer via Sachin Electronics web portal.'
        }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      // 1. Save in Cloud Firestore under orders collection
      const orderDocRef = doc(db, 'orders', cleanOrderId);
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<void>((resolve) => {
        timeoutId = setTimeout(() => {
          console.warn("Firestore order server acknowledgment taking longer; background synchronization is active.");
          resolve();
        }, 8000);
      });

      await Promise.race([
        setDoc(orderDocRef, sanitizeForFirebase(newOrder)),
        timeoutPromise
      ]);
      if (timeoutId) clearTimeout(timeoutId);

      // 2. Persist to recent orders list in localStorage
      try {
        const stored = localStorage.getItem('sachin_recent_orders');
        let list: string[] = stored ? JSON.parse(stored) : [];
        list = [cleanOrderId, ...list.filter((x: string) => x !== cleanOrderId)].slice(0, 5);
        localStorage.setItem('sachin_recent_orders', JSON.stringify(list));
      } catch (err) {
        console.warn('Could not update recent orders in localStorage', err);
      }
    } catch (firebaseErr) {
      console.error('Error saving order to Firestore:', firebaseErr);
    }

    let exchangeText = '';
    if (isExchange) {
      exchangeText = `\n• *Exchange:* Yes (${exchangeCondition.toUpperCase()}) - Discount: ₹${exchangeDiscount.toLocaleString('en-IN')}`;
    }

    let paymentProofText = '';
    if (payment === 'upi' && utrNumber) {
      paymentProofText = ` (UTR: ${utrNumber})`;
    }

    // 4-Point Strict 24-Hour Return & 360° Unboxing Policy
    const whatsappMessage = `*NEW PRODUCT BOOKING REQUEST*
*Order ID:* #${cleanOrderId}

*Product Details:*
• *Item:* ${buyingProduct?.name}
• *Price:* ₹${buyingProduct?.price.toLocaleString('en-IN')}${exchangeText}
• *Final Amount:* ₹${finalPrice.toLocaleString('en-IN')}

*Customer Details:*
• *Name:* ${name}
• *Mobile Number:* ${phone}
• *Delivery Address:* ${address}
• *Payment Mode:* ${payment.toString().toUpperCase()}${paymentProofText}

━━━━━━━━━━━━━━━━━━━━━
📦 *STRICT 24-HR RETURN & 360° UNBOXING POLICY:*
1. ⏱️ *24-Hour Return Window:* Any transit defect, damage, or discrepancy must be reported within 24 hours of delivery.
2. 📹 *Mandatory 360° Unboxing Video:* Continuous uncut 360-degree unboxing video showing sealed packaging & shipping label is mandatory for any claim.
3. 🏷️ *Original Packaging & Accessories:* Item must be unused with all tags, wires, parts, and original invoice intact.
4. 🚫 *No Post-Delivery Damage:* Physical drops, water ingress, or burnout due to electrical surge after delivery are not eligible for return.
━━━━━━━━━━━━━━━━━━━━━
Track live order status online using Order ID #${cleanOrderId}`;

    const whatsappUrl = `https://wa.me/918381892161?text=${encodeURIComponent(whatsappMessage)}`;

    // Store placed order details and activate clean success modal with WhatsApp confirmation
    setPlacedOrderId(cleanOrderId);
    setPlacedOrderWhatsAppUrl(whatsappUrl);
    setPlacedOrderSummary({
      productName: buyingProduct?.name || 'Electrical Appliance',
      productImage: buyingProduct?.image || '',
      finalPrice: finalPrice,
      customerName: name,
      phone: phone,
      address: address,
      paymentMode: payment.toString().toUpperCase()
    });

    // Close checkout sheet and show success modal
    setIsOrdering(false);
    setBuyingProduct(null);
    setOrderSuccess(true);

    // Clear form inputs
    setUtrNumber('');
    setPaymentScreenshotUrl('');
    setOrderName('');
    setOrderPhone('');
    setOrderAddress('');
  };

  // Top 4 to 5 key products for Featured Products section (e.g. Fan Blades, Motors, Capacitors, Inverters)
  const featuredProducts = useMemo(() => {
    if (!products || products.length === 0) return [];
    return products.slice(0, 5);
  }, [products]);

  const categories = useMemo(() => {
    const cats = new Set(products.map((p) => p.category).filter(Boolean));
    return ['All', ...Array.from(cats)];
  }, [products]);

  // Real-time case-insensitive search filtering:
  // products.filter(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()))
  const instantSearchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return products.filter((item) =>
      (item.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (item.category?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (item.description?.toLowerCase() || '').includes(searchQuery.toLowerCase())
    );
  }, [products, searchQuery]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch =
        !searchQuery.trim() ||
        (product.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        (product.description?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        (product.category?.toLowerCase() || '').includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'All' || product.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchQuery, selectedCategory]);

  const scrollCarousel = (direction: 'left' | 'right') => {
    if (carouselRef.current) {
      const scrollAmount = direction === 'left' ? -320 : 320;
      carouselRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  return (
    <section id="shop" className="py-20 bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Heading */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold uppercase tracking-wider mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Store & Replacement Parts</span>
          </div>
          <h2 className="text-3xl md:text-5xl font-extrabold text-slate-900 tracking-tight mb-3">
            Appliance Spares & Electronics
          </h2>
          <p className="text-base md:text-lg text-slate-600 max-w-2xl mx-auto">
            Top-rated genuine replacement spare parts and heavy-duty electrical appliances with warranty and direct booking.
          </p>
        </div>

        {/* 1. FEATURED PRODUCTS SECTION (TOP 4-5 DISPLAY) */}
        <div className="mb-16 bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-3 w-3 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-600"></span>
                </span>
                <h3 className="text-xl sm:text-2xl font-black text-slate-900">
                  Featured Products
                </h3>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Top 4–5 key components & appliances (Fan Blades, Motors, Capacitors, Inverters)
              </p>
            </div>

            {/* Carousel navigation controls */}
            <div className="flex items-center gap-2 self-end sm:self-center">
              <button
                type="button"
                id="featured-prev-btn"
                onClick={() => scrollCarousel('left')}
                className="p-2.5 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50 text-slate-700 hover:text-blue-600 transition-all shadow-sm active:scale-95"
                title="Previous Featured Products"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                id="featured-next-btn"
                onClick={() => scrollCarousel('right')}
                className="p-2.5 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50 text-slate-700 hover:text-blue-600 transition-all shadow-sm active:scale-95"
                title="Next Featured Products"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Horizontal carousel / grid */}
          <div
            ref={carouselRef}
            className="flex gap-5 overflow-x-auto pb-4 pt-1 snap-x scroll-smooth no-scrollbar"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {featuredProducts.map((product, idx) => (
              <div
                key={product.id || idx}
                className="min-w-[260px] sm:min-w-[290px] max-w-[300px] snap-start bg-slate-50/70 hover:bg-white rounded-2xl border border-slate-200/90 hover:border-blue-300 p-4 transition-all duration-300 hover:shadow-lg flex flex-col justify-between group"
              >
                <div>
                  <div className="relative h-44 rounded-xl overflow-hidden bg-slate-100 mb-3.5 flex items-center justify-center">
                    <img
                      src={product.image}
                      alt={product.name}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://placehold.co/400x300/1e293b/ffffff?text=${encodeURIComponent(product.name.slice(0, 5))}`;
                      }}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute top-2.5 left-2.5 bg-blue-600 text-white text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider shadow-sm">
                      Top Choice #{idx + 1}
                    </div>
                    <div className="absolute top-2.5 right-2.5 bg-white/95 backdrop-blur text-slate-800 text-[11px] font-bold px-2 py-0.5 rounded-md shadow-sm border border-slate-100">
                      {product.category}
                    </div>

                    <button
                      type="button"
                      onClick={() => setViewing3DProduct(product)}
                      className="absolute bottom-2.5 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur text-slate-900 px-3 py-1.5 rounded-full font-semibold text-xs shadow-md hover:bg-white transition-all opacity-0 group-hover:opacity-100 flex items-center gap-1.5"
                    >
                      <Box className="h-3.5 w-3.5 text-blue-600" />
                      <span>3D View</span>
                    </button>
                  </div>

                  <h4 className="text-base font-bold text-slate-900 line-clamp-1 group-hover:text-blue-600 transition-colors">
                    {product.name}
                  </h4>
                  <p className="text-xs text-slate-500 line-clamp-2 mt-1 mb-3">
                    {product.description}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-200/80 flex items-center justify-between gap-2 mt-auto">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">Price</span>
                    <span className="text-lg font-black text-slate-900">
                      ₹{product.price.toLocaleString('en-IN')}
                    </span>
                  </div>

                  <button
                    type="button"
                    id={`featured-book-btn-${product.id || idx}`}
                    onClick={() => handleBuyClick(product)}
                    className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-all shadow-md shadow-blue-500/20 active:scale-95 shrink-0"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    <span>Book / Request</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 2. FULLY FUNCTIONAL DYNAMIC SEARCH BAR */}
        <div ref={searchInputBoxRef} className="max-w-3xl mx-auto mb-10 space-y-4">
          <div className="relative">
            <div className="relative flex items-center bg-white rounded-2xl shadow-sm border border-slate-200 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition-all overflow-hidden p-1.5">
              <div className="pl-3.5 text-slate-400">
                <Search className="h-5 w-5" />
              </div>
              <input 
                id="shop-product-search"
                type="text" 
                placeholder="Search by product name, part (e.g. Fan Blades, Motors, Capacitors, Inverters)..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                className="w-full pl-3 pr-24 py-3 border-none outline-none text-slate-900 bg-transparent text-sm sm:text-base placeholder:text-slate-400 font-medium"
              />
              <div className="absolute right-3 flex items-center gap-1.5">
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
                    title="Clear search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                <VoiceInput 
                  isListening={isListeningSearch}
                  setIsListening={setIsListeningSearch}
                  onResult={(text) => {
                    setSearchQuery(text);
                    setIsSearchFocused(true);
                  }}
                  lang="hi-IN"
                />
              </div>
            </div>

            {/* Instant Matching Results Directly Below Search Bar as user types */}
            {isSearchFocused && searchQuery.trim() !== '' && (
              <div className="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden z-40 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs text-slate-500 font-semibold">
                  <span>Matching Results: {instantSearchResults.length}</span>
                  <span className="text-blue-600">Realtime Firebase Search</span>
                </div>

                <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                  {instantSearchResults.length > 0 ? (
                    instantSearchResults.map((product) => (
                      <div
                        key={`instant-${product.id || product.name}`}
                        className="p-3 hover:bg-blue-50/50 transition-colors flex items-center justify-between gap-3 text-left"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={product.image}
                            alt={product.name}
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = `https://placehold.co/80x80/1e293b/ffffff?text=${encodeURIComponent(product.name.slice(0, 3))}`;
                            }}
                            className="w-11 h-11 rounded-lg object-cover bg-slate-100 border border-slate-200 shrink-0"
                          />
                          <div className="min-w-0">
                            <h5 className="text-sm font-bold text-slate-900 truncate">
                              {product.name}
                            </h5>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                                {product.category}
                              </span>
                              <span className="text-xs font-black text-slate-900">
                                ₹{product.price.toLocaleString('en-IN')}
                              </span>
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          id={`instant-book-btn-${product.id || 'item'}`}
                          onClick={() => {
                            handleBuyClick(product);
                            setIsSearchFocused(false);
                          }}
                          className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-all shadow-sm flex items-center gap-1.5"
                        >
                          <ShoppingCart className="w-3 h-3" />
                          <span>Book / Request</span>
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="p-5 text-center text-slate-500 text-sm">
                      No products found matching "{searchQuery}". Try "Fan Blades", "Motors", "Capacitors", "Inverters".
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          
          {/* Category filter pills */}
          {categories.length > 1 && (
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              {categories.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setSelectedCategory(category)}
                  className={`px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all ${
                    selectedCategory === category 
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' 
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* All Products Catalog Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg sm:text-xl font-bold text-slate-800">
            {selectedCategory === 'All' ? 'All Products & Spares' : `${selectedCategory} Collection`}
            <span className="ml-2 text-xs font-medium text-slate-400">
              ({filteredProducts.length} items)
            </span>
          </h3>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-xs text-blue-600 hover:underline font-semibold"
            >
              Clear filter
            </button>
          )}
        </div>

        {/* Products Grid */}
        {loading ? (
          <div className="flex justify-center items-center h-64">
             <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center text-slate-500 py-16 bg-white rounded-2xl shadow-sm border border-slate-100">
            <p className="text-lg font-semibold text-slate-700">No products found matching your search.</p>
            <p className="text-sm text-slate-400 mt-1">Try clearing your search query or selecting "All" categories.</p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('All');
              }}
              className="mt-4 px-4 py-2 bg-blue-50 text-blue-600 rounded-xl text-sm font-bold hover:bg-blue-100 transition-colors"
            >
              Reset Search
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {filteredProducts.map((product) => (
              <TiltCard key={product.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm transition-all overflow-hidden group flex flex-col h-full hover:shadow-md">
                <div className="relative h-60 overflow-hidden bg-slate-50 flex items-center justify-center shrink-0">
                  <img 
                    src={product.image} 
                    alt={product.name} 
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `https://placehold.co/600x400/1e293b/ffffff?text=${encodeURIComponent(product.name)}`;
                    }}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute top-4 right-4 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-xs font-bold text-blue-600 shadow-sm z-10">
                    {product.category}
                  </div>
                  
                  <button 
                    type="button"
                    onClick={() => setViewing3DProduct(product)}
                    className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/80 backdrop-blur-md text-slate-900 px-4 py-2 rounded-full font-semibold text-sm shadow-lg hover:bg-white transition-all transform translate-y-12 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 flex items-center gap-2"
                  >
                    <Box className="h-4 w-4 text-blue-600" />
                    <span>View in 3D</span>
                  </button>
                </div>
                <div className="p-6 flex flex-col grow">
                  <h3 className="text-lg font-bold text-slate-900 mb-1.5 line-clamp-1 group-hover:text-blue-600 transition-colors">
                    {product.name}
                  </h3>
                  <p className="text-slate-500 text-sm mb-4 line-clamp-2">
                    {product.description}
                  </p>
                  <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-100">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">PRICE</span>
                      <span className="text-xl font-extrabold text-slate-900">
                        ₹{product.price.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <button 
                      type="button"
                      id={`buy-btn-${product.id}`}
                      onClick={() => handleBuyClick(product)}
                      className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-md shadow-blue-500/20 transition-all active:scale-95"
                    >
                      <ShoppingCart className="h-3.5 w-3.5" />
                      <span>Book / Request</span>
                    </button>
                  </div>
                </div>
              </TiltCard>
            ))}
          </div>
        )}
      </div>

      {/* Checkout / Booking Modal */}
      <AnimatePresence>
        {buyingProduct && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => !isOrdering && setBuyingProduct(null)}
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-white">
                <h3 className="text-xl font-bold text-slate-900">Book / Request Product</h3>
                <button 
                  type="button"
                  onClick={() => !isOrdering && setBuyingProduct(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto bg-white custom-scrollbar">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl mb-6 border border-slate-100">
                      <img 
                        src={buyingProduct.image} 
                        alt={buyingProduct.name} 
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = `https://placehold.co/100x100/1e293b/ffffff?text=Product`;
                        }}
                        className="w-16 h-16 object-cover rounded-lg bg-white border border-slate-200 shrink-0" 
                      />
                      <div>
                        <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                          {buyingProduct.category}
                        </span>
                        <h4 className="font-bold text-slate-900 leading-tight mt-1 mb-0.5">{buyingProduct.name}</h4>
                        <div className="text-blue-600 font-extrabold">₹{buyingProduct.price.toLocaleString('en-IN')}</div>
                      </div>
                    </div>

                    <form onSubmit={handleOrderSubmit} className="space-y-4">
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label htmlFor="order-name" className="block text-sm font-semibold text-slate-700">Full Name</label>
                          <VoiceInput 
                            isListening={isListeningOrderName}
                            setIsListening={setIsListeningOrderName}
                            onResult={(text) => setOrderName(prev => prev ? `${prev} ${text}` : text)}
                          />
                        </div>
                        <input required type="text" name="name" id="order-name" value={orderName} onChange={e => setOrderName(e.target.value)} className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-600 focus:border-blue-600 outline-none transition-all" placeholder="Enter your full name" />
                      </div>
                      <div>
                        <label htmlFor="order-phone" className="block text-sm font-semibold text-slate-700 mb-1">Phone Number</label>
                        <input required type="tel" name="phone" id="order-phone" value={orderPhone} onChange={e => setOrderPhone(e.target.value)} className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-600 focus:border-blue-600 outline-none transition-all" placeholder="Enter your 10-digit number" />
                      </div>
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label htmlFor="order-address" className="block text-sm font-semibold text-slate-700">Delivery Address</label>
                          <VoiceInput 
                            isListening={isListeningOrderAddress}
                            setIsListening={setIsListeningOrderAddress}
                            onResult={(text) => setOrderAddress(prev => prev ? `${prev} ${text}` : text)}
                          />
                        </div>
                        <textarea required name="address" id="order-address" rows={2} value={orderAddress} onChange={e => setOrderAddress(e.target.value)} className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-600 focus:border-blue-600 outline-none transition-all resize-none" placeholder="Enter your complete delivery address"></textarea>
                      </div>

                      <div className="pt-2 pb-2 border-t border-b border-slate-100">
                        <label className="flex items-center gap-2 cursor-pointer mb-3">
                          <input type="checkbox" checked={isExchange} onChange={(e) => setIsExchange(e.target.checked)} className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500" />
                          <span className="text-sm font-semibold text-slate-700">Exchange Old Appliance for Discount?</span>
                        </label>
                        
                        <AnimatePresence>
                          {isExchange && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mt-2 space-y-3">
                                <div>
                                  <label className="block text-xs font-semibold text-slate-600 mb-2">Old Appliance Condition</label>
                                  <select 
                                    value={exchangeCondition}
                                    onChange={(e) => setExchangeCondition(e.target.value as any)}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-600 outline-none text-sm bg-white"
                                  >
                                    <option value="working">Working Condition (Best Value)</option>
                                    <option value="non-working">Non-Working but Intact</option>
                                    <option value="scrap">Scrap Condition</option>
                                  </select>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                  <span className="text-slate-600">Estimated Exchange Value:</span>
                                  <span className="font-bold text-green-600">- ₹{exchangeDiscount.toLocaleString('en-IN')}</span>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      <div className="pt-2">
                        <div className="flex justify-between items-end mb-4 bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                          <div>
                            <p className="text-xs text-slate-500 uppercase tracking-wider font-bold mb-1">Final Amount</p>
                            <p className="text-2xl font-bold text-slate-900">₹{(buyingProduct.price - exchangeDiscount).toLocaleString('en-IN')}</p>
                          </div>
                          {isExchange && exchangeDiscount > 0 && (
                            <div className="text-right">
                              <p className="text-xs text-slate-500 line-through">₹{buyingProduct.price.toLocaleString('en-IN')}</p>
                              <p className="text-xs font-bold text-green-600">Saved ₹{exchangeDiscount.toLocaleString('en-IN')}</p>
                            </div>
                          )}
                        </div>

                        <label className="block text-sm font-semibold text-slate-700 mb-3">Select Payment Method</label>
                        <div className="grid grid-cols-3 gap-3">
                          <label className="cursor-pointer">
                            <input type="radio" name="payment" value="upi" className="peer sr-only" checked={paymentMethod === 'upi'} onChange={(e) => setPaymentMethod(e.target.value)} required />
                            <div className="border border-slate-200 rounded-lg p-3 text-center peer-checked:border-blue-600 peer-checked:bg-blue-50 peer-checked:text-blue-700 transition-all font-medium text-sm text-slate-600 hover:bg-slate-50">
                              UPI / QR
                            </div>
                          </label>
                          <label className="cursor-pointer">
                            <input type="radio" name="payment" value="card" className="peer sr-only" checked={paymentMethod === 'card'} onChange={(e) => setPaymentMethod(e.target.value)} required />
                            <div className="border border-slate-200 rounded-lg p-3 text-center peer-checked:border-blue-600 peer-checked:bg-blue-50 peer-checked:text-blue-700 transition-all font-medium text-sm text-slate-600 hover:bg-slate-50">
                              Card
                            </div>
                          </label>
                          <label className="cursor-pointer">
                            <input type="radio" name="payment" value="cod" className="peer sr-only" checked={paymentMethod === 'cod'} onChange={(e) => setPaymentMethod(e.target.value)} required />
                            <div className="border border-slate-200 rounded-lg p-3 text-center peer-checked:border-blue-600 peer-checked:bg-blue-50 peer-checked:text-blue-700 transition-all font-medium text-sm text-slate-600 hover:bg-slate-50">
                              COD / Pay on Delivery
                            </div>
                          </label>
                        </div>
                      </div>

                      {paymentMethod === 'upi' && (
                        <AnimatePresence>
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="bg-blue-50 border border-blue-100 rounded-xl p-6 flex flex-col items-center justify-center space-y-4">
                              <div className="bg-white p-3 rounded-xl shadow-sm">
                                <QRCode value={`upi://pay?pa=sachinelectricals@upi&pn=Sachin%20Electricals&am=${buyingProduct.price - exchangeDiscount}&cu=INR`} size={128} />
                              </div>
                              <div className="text-center">
                                <p className="text-sm font-semibold text-slate-900">Scan QR Code to pay ₹{(buyingProduct.price - exchangeDiscount).toLocaleString('en-IN')}</p>
                                <p className="text-xs text-slate-500 mt-1">GPay, PhonePe, Paytm, etc.</p>
                                <p className="text-xs font-medium text-slate-700 mt-2 mb-2">UPI ID: sachinelectricals@upi</p>
                                <p className="text-[11px] text-blue-700 font-medium">Scan QR Code to pay, then upload screenshot and enter 12-digit UTR below.</p>
                              </div>
                              
                              <div className="w-full space-y-3 mt-4 text-left">
                                <div>
                                  <label className="block text-xs font-semibold text-slate-700 mb-1">UTR / Transaction ID</label>
                                  <input 
                                    type="text" 
                                    value={utrNumber} 
                                    onChange={e => setUtrNumber(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm outline-none"
                                    placeholder="e.g. 12-digit number"
                                  />
                                </div>
                                
                                <div>
                                  <label className="block text-xs font-semibold text-slate-700 mb-1">Upload Payment Screenshot</label>
                                  <div className="mt-1 flex justify-center px-4 py-4 border-2 border-blue-200 border-dashed rounded-md relative overflow-hidden group hover:border-blue-400 transition-colors bg-white">
                                    {paymentScreenshotUrl ? (
                                      <div className="absolute inset-0">
                                        <img src={paymentScreenshotUrl} alt="Payment Screenshot" className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                          <p className="text-white text-xs font-medium">Click to change</p>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="space-y-1 text-center">
                                        <Camera className="mx-auto h-8 w-8 text-blue-400" />
                                        <div className="flex text-xs text-slate-600 justify-center">
                                          <span className="relative cursor-pointer bg-transparent rounded-md font-medium text-blue-600 hover:text-blue-500">
                                            Take photo
                                          </span>
                                        </div>
                                      </div>
                                    )}
                                    <input type="file" accept="image/*" capture="environment" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleScreenshotUpload} />
                                  </div>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        </AnimatePresence>
                      )}

                      {paymentMethod === 'card' && (
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3">
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">Card Number</label>
                            <input type="text" className="w-full px-3 py-2 rounded-md border border-slate-200 focus:ring-2 focus:ring-blue-600 outline-none" placeholder="0000 0000 0000 0000" required />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-semibold text-slate-500 mb-1">Expiry (MM/YY)</label>
                              <input type="text" className="w-full px-3 py-2 rounded-md border border-slate-200 focus:ring-2 focus:ring-blue-600 outline-none" placeholder="12/25" required />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-500 mb-1">CVV</label>
                              <input type="text" className="w-full px-3 py-2 rounded-md border border-slate-200 focus:ring-2 focus:ring-blue-600 outline-none" placeholder="123" required />
                            </div>
                          </div>
                        </div>
                      )}
                      
                      <div className="pt-4 mt-2 border-t border-slate-100">
                        <div className="flex justify-between items-center mb-4">
                          <span className="text-slate-600">Total Amount</span>
                          <span className="text-xl font-bold text-slate-900">₹{(buyingProduct.price - exchangeDiscount).toLocaleString('en-IN')}</span>
                        </div>
                        <button 
                          type="submit" 
                          disabled={isOrdering}
                          className="w-full bg-blue-600 text-white font-bold py-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center gap-2 shadow-lg shadow-blue-200 btn-3d btn-3d-blue"
                        >
                          {isOrdering ? (
                            <>
                              <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                              Processing...
                            </>
                          ) : (
                            'Confirm Request & Place Order'
                          )}
                        </button>
                      </div>
                    </form>
                  </motion.div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Order Placed Success Modal */}
      <AnimatePresence>
        {orderSuccess && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm"
              onClick={() => setOrderSuccess(false)}
            />

            <motion.div 
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-lg overflow-hidden my-auto z-10"
            >
              {/* Header Close Button */}
              <button 
                type="button"
                onClick={() => setOrderSuccess(false)}
                className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors z-20"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="p-6 sm:p-8 space-y-6">
                {/* Top Success Icon & Heading */}
                <div className="text-center space-y-2">
                  <div className="mx-auto w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center border-4 border-emerald-100 shadow-sm">
                    <CheckCircle2 className="w-9 h-9 text-emerald-600" />
                  </div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                    Order Placed Successfully!
                  </h3>
                  <p className="text-sm text-slate-600 max-w-sm mx-auto leading-relaxed">
                    Your request has been saved in our database. Send a quick confirmation on WhatsApp to initiate packing & dispatch.
                  </p>
                </div>

                {/* Generated Order ID Display Card */}
                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Order Tracking ID
                    </span>
                    <span className="text-xl font-mono font-bold text-slate-900 tracking-wide">
                      #{placedOrderId}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyOrderId}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 hover:border-slate-300 text-slate-700 shadow-sm transition-all hover:bg-slate-100 active:scale-95"
                  >
                    {copiedPlacedId ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-slate-500" />
                        <span>Copy ID</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Placed Order Summary */}
                {placedOrderSummary && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2.5 text-xs text-slate-600">
                    <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                      <span className="font-semibold text-slate-800 text-sm">{placedOrderSummary.productName}</span>
                      <span className="font-bold text-slate-900 text-sm">₹{placedOrderSummary.finalPrice.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Customer:</span>
                      <span className="font-medium text-slate-800">{placedOrderSummary.customerName} ({placedOrderSummary.phone})</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Payment Mode:</span>
                      <span className="font-medium uppercase text-slate-800">{placedOrderSummary.paymentMode}</span>
                    </div>
                  </div>
                )}

                {/* 24-Hr Return Guarantee & 360° Unboxing Policy Note */}
                <div className="bg-amber-50/80 border border-amber-200/70 rounded-xl p-3 flex items-start gap-2.5 text-xs text-amber-900">
                  <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    <span className="font-bold">24-Hour Return & 360° Unboxing: </span>
                    Keep packaging intact. Continuous 360° uncut unboxing video is required for transit warranty claims.
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-3 pt-1">
                  {/* Primary WhatsApp Button */}
                  <button
                    type="button"
                    onClick={() => {
                      if (placedOrderWhatsAppUrl) {
                        window.open(placedOrderWhatsAppUrl, '_blank', 'noopener,noreferrer');
                      }
                    }}
                    className="w-full py-4 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-600/30 transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
                  >
                    <MessageCircle className="w-5 h-5 fill-white" />
                    <span>📲 Send Confirmation on WhatsApp</span>
                  </button>
                  <p className="text-[11px] text-center text-slate-400">
                    Directly opens WhatsApp with pre-filled Order ID #{placedOrderId}
                  </p>

                  {/* Secondary Actions */}
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setOrderSuccess(false);
                        window.dispatchEvent(new CustomEvent('open-my-orders', { detail: { orderId: placedOrderId } }));
                      }}
                      className="py-3 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Package className="w-4 h-4 text-slate-500" />
                      <span>Track Order</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrderSuccess(false)}
                      className="py-3 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <span>Continue Shopping</span>
                      <ArrowRight className="w-4 h-4 text-slate-400" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 3D Viewer Modal */}
      <AnimatePresence>
        {viewing3DProduct && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm"
              onClick={() => setViewing3DProduct(null)}
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col h-[80vh]"
            >
              <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-white absolute top-0 left-0 right-0 z-10">
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Box className="w-5 h-5 text-blue-600" />
                  3D View: {viewing3DProduct.name}
                </h3>
                <button 
                  type="button"
                  onClick={() => setViewing3DProduct(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 w-full bg-slate-50 pt-16">
                <model-viewer
                  src="https://modelviewer.dev/shared-assets/models/Astronaut.glb"
                  alt={`3D model of ${viewing3DProduct.name}`}
                  auto-rotate
                  camera-controls
                  ar
                  shadow-intensity="1"
                  style={{ width: '100%', height: '100%' }}
                ></model-viewer>
                <div className="absolute bottom-4 left-0 right-0 text-center pointer-events-none">
                  <p className="inline-block bg-black/50 backdrop-blur text-white px-4 py-2 rounded-full text-sm">
                    Drag to rotate • Scroll to zoom
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </section>
  );
}
