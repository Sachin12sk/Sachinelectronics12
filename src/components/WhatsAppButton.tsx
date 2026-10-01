import React, { useState, useEffect } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { getDocs } from 'firebase/firestore';
import { areaAdminsCollection } from '../lib/firebase';

export default function WhatsAppButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [pincode, setPincode] = useState('');
  const [areaAdmins, setAreaAdmins] = useState<any[]>([]);

  useEffect(() => {
    // Fetch area admins from Firestore
    const fetchAdmins = async () => {
      try {
        const snap = await getDocs(areaAdminsCollection);
        if (!snap.empty) {
          const admins = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setAreaAdmins(admins);
        }
      } catch (e) {
        console.warn('Firestore areaAdmins fetch note in WhatsAppButton:', e);
      }
    };
    fetchAdmins();
  }, []);

  const handleChat = (e: React.FormEvent) => {
    e.preventDefault();
    let adminPhone = "918381892161"; // Fallback
    const matching = areaAdmins.find(a => a.pincodes && a.pincodes.includes(pincode) && a.isActive);
    if (matching && matching.phone && matching.permissions?.canWA !== false) {
      adminPhone = matching.phone.replace(/[^0-9]/g, '');
      if (adminPhone.length === 10) adminPhone = "91" + adminPhone;
    }
    
    window.open(`https://wa.me/${adminPhone}?text=Hi, I need customer support.`, '_blank');
    setIsOpen(false);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 bg-[#25D366] text-white p-4 rounded-full shadow-lg shadow-[#25D366]/30 hover:shadow-xl hover:scale-110 hover:-translate-y-1 transition-all duration-300 flex items-center justify-center group"
        aria-label="Chat on WhatsApp"
      >
        <MessageCircle className="w-7 h-7" />
        <span className="absolute right-full mr-4 bg-white text-slate-800 text-sm font-semibold px-3 py-1.5 rounded-lg shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none whitespace-nowrap">
          Chat with us!
        </span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in duration-200">
            <div className="bg-[#25D366] p-4 text-white flex justify-between items-center">
              <h3 className="font-bold flex items-center gap-2"><MessageCircle className="w-5 h-5"/> Customer Support</h3>
              <button onClick={() => setIsOpen(false)} className="hover:bg-white/20 p-1 rounded-full transition-colors"><X className="w-5 h-5"/></button>
            </div>
            <form onSubmit={handleChat} className="p-6">
              <p className="text-sm text-slate-600 mb-4">Please enter your PIN Code so we can route you to your local manager for faster service.</p>
              <input
                required
                type="text"
                maxLength={6}
                pattern="[0-9]{6}"
                value={pincode}
                onChange={e => setPincode(e.target.value)}
                placeholder="e.g. 209202"
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#25D366] outline-none mb-4"
              />
              <button type="submit" className="w-full bg-[#25D366] hover:bg-[#1DA851] text-white font-bold py-3 rounded-xl transition-colors">
                Start Chat
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
