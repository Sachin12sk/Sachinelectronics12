import React, { useState, useEffect, useMemo, useRef } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { productsCollection } from '../lib/firebase';
import { Product } from '../types';
import { products as defaultProducts } from '../data';
import { Search, X, ShoppingBag, ArrowRight, Sparkles } from 'lucide-react';

export default function Hero() {
  const [searchTerm, setSearchTerm] = useState('');
  const [products, setProducts] = useState<Product[]>(defaultProducts);
  const [isFocused, setIsFocused] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Realtime Cloud Firestore Sync for Products
  useEffect(() => {
    const unsubscribe = onSnapshot(
      productsCollection,
      (snapshot) => {
        if (!snapshot.empty) {
          const liveProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Product[];
          const existingIds = new Set(liveProducts.map(p => p.id));
          const combined = [
            ...liveProducts,
            ...defaultProducts.filter(p => !existingIds.has(p.id))
          ];
          setProducts(combined);
        } else {
          setProducts(defaultProducts);
        }
      },
      (err) => {
        console.warn("Firestore products sync note in Hero:", err);
        setProducts(defaultProducts);
      }
    );

    return () => unsubscribe();
  }, []);

  // Close search preview when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Real-time case-insensitive search filtering
  const matchingResults = useMemo(() => {
    if (!searchTerm.trim()) return [];
    return products.filter(item =>
      (item.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (item.category?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    );
  }, [products, searchTerm]);

  const handleBookRequest = (product: Product) => {
    window.dispatchEvent(new CustomEvent('open-product-request', { detail: product }));
    setIsFocused(false);
    const el = document.getElementById('shop');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleQuickTagClick = (tag: string) => {
    setSearchTerm(tag);
    setIsFocused(true);
  };

  return (
    <section className="relative w-full min-h-[90vh] flex items-center justify-center overflow-hidden bg-slate-950 py-16">
      {/* Background Video */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover z-0 opacity-60"
      >
        <source
          src="http://googleusercontent.com/generated_video_content/7887689507900307013"
          type="video/mp4"
        />
      </video>

      {/* Dark Overlay for readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/85 via-slate-900/70 to-slate-950/95 z-1" />

      {/* Hero Content */}
      <div className="relative z-10 max-w-4xl mx-auto px-4 text-center text-white">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs sm:text-sm font-semibold mb-4 backdrop-blur-md">
          <Sparkles className="w-4 h-4 text-blue-400" />
          <span>Verified Parts & Certified Electrical Repairs</span>
        </div>

        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-3 text-blue-400 drop-shadow-md">
          Sachin Electronic
        </h1>
        <p className="text-xl md:text-2xl font-semibold mb-3 text-slate-200">
          Electricals & Repairs
        </p>
        <p className="text-sm md:text-base text-slate-300 max-w-2xl mx-auto mb-8">
          Fast, reliable, and affordable repair services for all major brands including Voltas, Intex, LG, Crompton, and genuine replacement spare parts.
        </p>

        {/* Dynamic Search Bar on Home Page */}
        <div ref={searchContainerRef} className="relative max-w-2xl mx-auto mb-8 text-left">
          <div className="relative flex items-center bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl p-1.5 border border-white/20 focus-within:ring-2 focus-within:ring-blue-500 transition-all">
            <div className="pl-3.5 text-slate-400">
              <Search className="h-5 w-5" />
            </div>
            <input
              id="hero-product-search"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={() => setIsFocused(true)}
              placeholder="Search products & parts (e.g. Fan Blades, Motors, Capacitors, Inverters)..."
              className="w-full px-3 py-2.5 text-sm md:text-base text-slate-900 bg-transparent outline-none placeholder:text-slate-400 font-medium"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors mr-1"
                title="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <a
              href="#shop"
              className="hidden sm:inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs md:text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shrink-0 shadow-md"
            >
              <span>Explore</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>

          {/* Instant Matching Results Directly Below Search Bar */}
          {isFocused && searchTerm.trim() !== '' && (
            <div className="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="p-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
                <span>
                  {matchingResults.length > 0 
                    ? `Matching Products (${matchingResults.length})` 
                    : 'Search Results'}
                </span>
                <span className="text-blue-600 font-semibold">Live Firebase Sync</span>
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                {matchingResults.length > 0 ? (
                  matchingResults.map((product) => (
                    <div
                      key={product.id || product.name}
                      className="p-3 hover:bg-blue-50/50 transition-colors flex items-center justify-between gap-3 text-left"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={product.image}
                          alt={product.name}
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = `https://placehold.co/100x100/1e293b/ffffff?text=${encodeURIComponent(product.name.slice(0, 4))}`;
                          }}
                          className="w-12 h-12 rounded-lg object-cover bg-slate-100 shrink-0 border border-slate-200"
                        />
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-slate-900 truncate">
                            {product.name}
                          </h4>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                              {product.category}
                            </span>
                            <span className="text-sm font-extrabold text-slate-900">
                              ₹{product.price.toLocaleString('en-IN')}
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        id={`hero-book-btn-${product.id || 'item'}`}
                        onClick={() => handleBookRequest(product)}
                        className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-2 rounded-lg transition-all shadow-sm flex items-center gap-1.5"
                      >
                        <ShoppingBag className="w-3.5 h-3.5" />
                        <span>Book / Request</span>
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="p-6 text-center text-slate-500 text-sm">
                    <p className="font-semibold text-slate-700">No matching products found for "{searchTerm}"</p>
                    <p className="text-xs text-slate-400 mt-1">Try keywords like Fan Blades, Motors, Capacitors, Inverters</p>
                  </div>
                )}
              </div>

              {matchingResults.length > 0 && (
                <div className="p-2.5 bg-slate-50 border-t border-slate-100 text-center">
                  <a
                    href="#shop"
                    onClick={() => setIsFocused(false)}
                    className="text-xs text-blue-600 hover:text-blue-700 font-bold inline-flex items-center gap-1"
                  >
                    <span>View all products in Store</span>
                    <ArrowRight className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Quick Tag Recommendations */}
          <div className="mt-2.5 flex flex-wrap items-center justify-center sm:justify-start gap-1.5 text-xs">
            <span className="text-slate-400 text-[11px] font-medium mr-1">Popular:</span>
            {['Fan Blades', 'Motors', 'Capacitors', 'Inverters'].map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => handleQuickTagClick(tag)}
                className="px-2.5 py-1 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 transition-colors text-[11px]"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            id="hero-book-repair-link"
            href="#complaint"
            className="w-full sm:w-auto px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg transition-all"
          >
            Book Repair Service &rarr;
          </a>
          <a
            id="hero-browse-products-link"
            href="#shop"
            className="w-full sm:w-auto px-8 py-3.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl border border-slate-600 transition-all"
          >
            Browse Products
          </a>
        </div>
      </div>
    </section>
  );
}
