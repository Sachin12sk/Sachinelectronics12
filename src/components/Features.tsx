import { Clock, ShieldCheck, ThumbsUp, MapPin, MessageSquare, Wrench } from 'lucide-react';
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../lib/firebase';
import featuresBgImg from '../assets/images/features_background_1785441954792.jpg';

const features = [
  {
    id: 'fast-response',
    icon: <Clock className="w-6 h-6 text-blue-600" />,
    title: 'Fast Response Time',
    description: 'We usually reach your location within 2 hours of booking a complaint.',
  },
  {
    id: 'genuine-parts',
    icon: <ShieldCheck className="w-6 h-6 text-blue-600" />,
    title: 'Genuine Spare Parts',
    description: 'We only use authentic parts to ensure the longevity of your appliances.',
  },
  {
    id: 'expert-techs',
    icon: <ThumbsUp className="w-6 h-6 text-blue-600" />,
    title: 'Expert Technicians',
    description: 'Our team consists of certified professionals with years of experience.',
  },
  {
    id: 'local-network',
    icon: <MapPin className="w-6 h-6 text-blue-600" />,
    title: 'Local to You',
    description: 'Serving the entire city with a network of reliable repair experts.',
  },
];

export default function Features() {
  const [likes, setLikes] = useState<Record<string, number>>({
    'fast-response': 124,
    'genuine-parts': 98,
    'expert-techs': 156,
    'local-network': 89
  });
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [feedbackFeature, setFeedbackFeature] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);

  const handleLike = (id: string) => {
    if (liked[id]) return;
    setLikes(prev => ({ ...prev, [id]: prev[id] + 1 }));
    setLiked(prev => ({ ...prev, [id]: true }));
  };

  const submitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackText.trim() || !feedbackFeature) return;
    
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'feedback'), {
        featureId: feedbackFeature,
        text: feedbackText,
        createdAt: new Date().toISOString()
      });
      setFeedbackSuccess(true);
      setTimeout(() => {
        setFeedbackSuccess(false);
        setFeedbackFeature(null);
        setFeedbackText('');
      }, 2000);
    } catch (error) {
      console.error("Error submitting feedback:", error);
      alert("Failed to submit feedback. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="relative py-20 bg-white overflow-hidden">
      <div className="absolute inset-0 z-0">
        <img src={featuresBgImg} alt="Background" className="w-full h-full object-cover opacity-[0.03]" />
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-extrabold text-slate-900 mb-4">Why Choose Sachin Electricals?</h2>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            We bring professionalism, speed, and reliability to every repair job.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((feature) => (
            <div key={feature.id} className="bg-slate-50 rounded-2xl p-6 border border-slate-100 hover:shadow-lg hover:border-blue-100 transition-all group flex flex-col h-full">
              <div className="bg-white w-14 h-14 rounded-xl shadow-sm flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                {feature.icon}
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">{feature.title}</h3>
              <p className="text-slate-600 leading-relaxed flex-grow">
                {feature.description}
              </p>
              
              <div className="mt-6 pt-6 border-t border-slate-200">
                <div className="flex justify-between items-center mb-4">
                  <button 
                    onClick={() => handleLike(feature.id)}
                    className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${liked[feature.id] ? 'text-blue-600' : 'text-slate-500 hover:text-blue-600'}`}
                  >
                    <ThumbsUp className={`w-4 h-4 ${liked[feature.id] ? 'fill-current' : ''}`} />
                    <span>{likes[feature.id]} Likes</span>
                  </button>
                  <button 
                    onClick={() => setFeedbackFeature(feature.id)}
                    className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>Feedback</span>
                  </button>
                </div>
                <a 
                  href="#complaint"
                  className="w-full flex items-center justify-center gap-2 bg-slate-200 hover:bg-blue-600 hover:text-white text-slate-800 font-semibold py-2.5 rounded-lg transition-all"
                >
                  <Wrench className="w-4 h-4" />
                  Service Request
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {feedbackFeature && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4"
            onClick={() => !isSubmitting && setFeedbackFeature(null)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md"
              onClick={e => e.stopPropagation()}
            >
              {feedbackSuccess ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <ThumbsUp className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Thank You!</h3>
                  <p className="text-slate-600">Your feedback has been submitted successfully.</p>
                </div>
              ) : (
                <>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Share Your Feedback</h3>
                  <p className="text-slate-600 text-sm mb-4">Tell us what you think about "{features.find(f => f.id === feedbackFeature)?.title}"</p>
                  
                  <form onSubmit={submitFeedback}>
                    <textarea 
                      required
                      rows={4}
                      value={feedbackText}
                      onChange={e => setFeedbackText(e.target.value)}
                      placeholder="Write your comment here..."
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none resize-none mb-4"
                    ></textarea>
                    
                    <div className="flex gap-3">
                      <button 
                        type="button" 
                        onClick={() => setFeedbackFeature(null)}
                        disabled={isSubmitting}
                        className="flex-1 bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl hover:bg-slate-200 transition-colors"
                      >
                        Cancel
                      </button>
                      <button 
                        type="submit" 
                        disabled={isSubmitting}
                        className="flex-1 bg-blue-600 text-white font-bold py-2.5 rounded-xl hover:bg-blue-700 transition-colors flex justify-center items-center gap-2"
                      >
                        {isSubmitting ? (
                          <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : 'Submit'}
                      </button>
                    </div>
                  </form>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
