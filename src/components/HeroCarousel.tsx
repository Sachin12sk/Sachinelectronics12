import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { getDocs } from 'firebase/firestore';
import { promotionsCollection } from '../lib/firebase';
import { Promotion } from '../types';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function HeroCarousel() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const fetchPromotions = async () => {
      try {
        const fsSnap = await getDocs(promotionsCollection);
        if (!fsSnap.empty && isMounted) {
          const activePromos = fsSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter((p: any) => p.isActive) as Promotion[];
          activePromos.sort((a, b) => a.order - b.order);
          setPromotions(activePromos);
        }
      } catch (error: any) {
        console.warn('Firestore promotions fetch note:', error?.message || error);
      }
    };
    
    fetchPromotions();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    if (promotions.length <= 1) return;
    
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % promotions.length);
    }, 5000);
    
    return () => clearInterval(interval);
  }, [promotions]);

  const nextSlide = () => {
    setCurrentIndex((prev) => (prev + 1) % promotions.length);
  };

  const prevSlide = () => {
    setCurrentIndex((prev) => (prev === 0 ? promotions.length - 1 : prev - 1));
  };

  if (promotions.length === 0) return null;

  const currentPromo = promotions[currentIndex];

  return (
    <div className="relative w-full max-w-5xl mx-auto mt-12 h-64 md:h-80 rounded-2xl overflow-hidden shadow-2xl group">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentPromo.id}
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="absolute inset-0"
        >
          <div 
            className="absolute inset-0 bg-cover bg-center"
            style={{ 
              backgroundImage: `url(${currentPromo.imageUrl || 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?q=80&w=2069&auto=format&fit=crop'})` 
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-slate-900/90 to-slate-900/40"></div>
          </div>
          <div className="absolute inset-0 flex flex-col justify-center px-8 md:px-16">
            <motion.h3 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-3xl md:text-5xl font-extrabold text-white mb-2 md:mb-4 drop-shadow-lg"
            >
              {currentPromo.title}
            </motion.h3>
            <motion.p 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-lg md:text-2xl text-blue-300 font-semibold drop-shadow-md"
            >
              {currentPromo.subtitle}
            </motion.p>
          </div>
        </motion.div>
      </AnimatePresence>

      {promotions.length > 1 && (
        <>
          <button 
            onClick={prevSlide}
            className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/60 text-white p-2 rounded-full backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-all"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button 
            onClick={nextSlide}
            className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/60 text-white p-2 rounded-full backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-all"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
          
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
            {promotions.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentIndex(idx)}
                className={`w-2.5 h-2.5 rounded-full transition-all ${
                  idx === currentIndex ? 'bg-blue-500 w-8' : 'bg-white/50 hover:bg-white'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
