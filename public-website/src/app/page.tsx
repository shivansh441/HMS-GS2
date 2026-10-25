'use client';

import React from 'react';
import Link from 'next/link';
import { BRAND } from '../lib/constants';
import { Reveal } from '../components/motion/Reveal';
import { Stagger } from '../components/motion/Stagger';
import { SplitHeading } from '../components/motion/SplitHeading';
import { CountUp } from '../components/motion/CountUp';
import { Parallax } from '../components/motion/Parallax';
import { MagneticButton } from '../components/motion/MagneticButton';
import { Hotel, Bed, Building, Sparkles, Shield, ArrowRight, Star, CheckCircle2 } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="space-y-28 pb-20">
      {/* Hero Section */}
      <section className="relative min-h-[85vh] flex items-center justify-center overflow-hidden bg-gradient-to-b from-amber-50/50 via-stone-50 to-stone-50 px-6 pt-12">
        <div className="max-w-5xl mx-auto text-center space-y-8 z-10">
          <Reveal direction="down" duration={0.6}>
            <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-amber-100/80 border border-amber-200/80 text-amber-950 text-xs font-medium tracking-wide">
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              <span>Modern Stays for the Mindful Traveler</span>
            </div>
          </Reveal>

          <div className="space-y-4">
            <SplitHeading
              text="Sanctuaries Designed for Modern Rest and Community"
              as="h1"
              className="text-4xl sm:text-6xl md:text-7xl font-serif tracking-tight text-slate-900 leading-[1.08]"
            />
            <Reveal direction="up" delay={0.2} duration={0.8}>
              <p className="max-w-2xl mx-auto text-base sm:text-lg text-slate-600 font-normal leading-relaxed pt-2">
                Whether you seek a weekend boutique hotel suite, a vibrant social hostel loft, or a month-long co-living residence, Haven Stays blends architectural calm with effortless hospitality.
              </p>
            </Reveal>
          </div>

          <Reveal direction="up" delay={0.4} duration={0.8}>
            <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
              <MagneticButton>
                <Link
                  href="/signin"
                  className="px-7 py-3.5 rounded-full bg-slate-900 text-white text-sm font-semibold tracking-wide hover:bg-slate-800 transition-all inline-flex items-center space-x-2 shadow-lg shadow-slate-900/10"
                >
                  <span>Explore Stays & Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </MagneticButton>
              <Link
                href="/about"
                className="px-7 py-3.5 rounded-full bg-white border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors"
              >
                Our Philosophy
              </Link>
            </div>
          </Reveal>

          {/* Stats Bar with CountUp */}
          <Reveal direction="up" delay={0.6}>
            <div className="pt-16 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto border-t border-slate-200/80">
              <div>
                <div className="text-2xl sm:text-3xl font-serif font-bold text-slate-900">
                  <CountUp end={98} suffix="%" />
                </div>
                <div className="text-xs text-slate-500 uppercase tracking-wider font-mono mt-1">Guest Satisfaction</div>
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-serif font-bold text-slate-900">
                  <CountUp end={2} suffix=" Prime" />
                </div>
                <div className="text-xs text-slate-500 uppercase tracking-wider font-mono mt-1">Metropolitan Hubs</div>
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-serif font-bold text-slate-900">
                  <CountUp end={24} suffix="/7" />
                </div>
                <div className="text-xs text-slate-500 uppercase tracking-wider font-mono mt-1">Digital Concierge</div>
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-serif font-bold text-slate-900">
                  <CountUp end={100} suffix="% Keyless" />
                </div>
                <div className="text-xs text-slate-500 uppercase tracking-wider font-mono mt-1">Contactless Check-In</div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Triad Stays Section */}
      <section id="stays" className="max-w-7xl mx-auto px-6 space-y-12">
        <div className="text-center space-y-3">
          <span className="text-xs font-mono font-bold uppercase tracking-widest text-amber-700">
            Three Experiences, One Standard
          </span>
          <h2 className="text-3xl sm:text-4xl font-serif font-bold text-slate-900">
            Tailored for Every Chapter of Travel
          </h2>
          <p className="text-sm text-slate-600 max-w-xl mx-auto">
            From overnight getaways to seasonal nomad stays, experience seamless guest services without friction.
          </p>
        </div>

        <Stagger className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Hotel */}
          <div className="stagger-item bg-white border border-slate-200/80 p-8 rounded-2xl shadow-sm hover:shadow-md transition-shadow space-y-6">
            <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200/60 flex items-center justify-center text-amber-800">
              <Hotel className="w-6 h-6" />
            </div>
            <div className="space-y-2">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold">HQ-01 Grand</span>
              <h3 className="text-xl font-serif font-bold text-slate-900">Boutique Hotel Suites</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Refined acoustic privacy, artisanal coffee bars, and king-size organic mattresses crafted for high-comfort leisure and business travel.
              </p>
            </div>
            <ul className="space-y-2 text-xs text-slate-600 border-t border-slate-100 pt-4 font-mono">
              <li className="flex items-center"><CheckCircle2 className="w-3.5 h-3.5 mr-2 text-emerald-600" /> Executive workspace & high-speed mesh</li>
              <li className="flex items-center"><CheckCircle2 className="w-3.5 h-3.5 mr-2 text-emerald-600" /> Dedicated 24/7 concierge & baggage service</li>
            </ul>
          </div>

          {/* Hostel */}
          <div id="hostel" className="stagger-item bg-white border border-slate-200/80 p-8 rounded-2xl shadow-sm hover:shadow-md transition-shadow space-y-6">
            <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200/60 flex items-center justify-center text-blue-800">
              <Bed className="w-6 h-6" />
            </div>
            <div className="space-y-2">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold">HQ-02 Waterfront</span>
              <h3 className="text-xl font-serif font-bold text-slate-900">Social Hostel Lofts</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Smart capsule pods with privacy curtains, integrated charging ports, individual climate dampeners, and shared rooftop community lounges.
              </p>
            </div>
            <ul className="space-y-2 text-xs text-slate-600 border-t border-slate-100 pt-4 font-mono">
              <li className="flex items-center"><CheckCircle2 className="w-3.5 h-3.5 mr-2 text-emerald-600" /> Curated communal cooking & evening events</li>
              <li className="flex items-center"><CheckCircle2 className="w-3.5 h-3.5 mr-2 text-emerald-600" /> Soundproof sleeping quarters & secure lockers</li>
            </ul>
          </div>

          {/* Long Term */}
          <div id="living" className="stagger-item bg-white border border-slate-200/80 p-8 rounded-2xl shadow-sm hover:shadow-md transition-shadow space-y-6">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200/60 flex items-center justify-center text-emerald-800">
              <Building className="w-6 h-6" />
            </div>
            <div className="space-y-2">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold">Multi-Location</span>
              <h3 className="text-xl font-serif font-bold text-slate-900">Long-Term Residences</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Flexible 30-day to 12-month residential living with fully equipped designer kitchens, in-unit laundry, and inclusive utility billing.
              </p>
            </div>
            <ul className="space-y-2 text-xs text-slate-600 border-t border-slate-100 pt-4 font-mono">
              <li className="flex items-center"><CheckCircle2 className="w-3.5 h-3.5 mr-2 text-emerald-600" /> Flexible lease terms & zero deposit hassles</li>
              <li className="flex items-center"><CheckCircle2 className="w-3.5 h-3.5 mr-2 text-emerald-600" /> Full resident privileges & parcel lockers</li>
            </ul>
          </div>
        </Stagger>
      </section>

      {/* Testimonials Strip */}
      <section className="bg-stone-900 text-stone-100 py-20 px-6">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="text-center space-y-2">
            <span className="text-xs font-mono uppercase tracking-widest text-amber-400">Guest Reflections</span>
            <h2 className="text-2xl sm:text-3xl font-serif font-bold">Trusted by Global Travelers & Residents</h2>
          </div>

          <Stagger className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="stagger-item p-6 rounded-xl bg-stone-850 border border-stone-800 space-y-4">
              <div className="flex text-amber-400">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-current" />
                ))}
              </div>
              <p className="text-xs text-stone-300 leading-relaxed italic">
                "The contactless arrival worked flawlessly. Within 2 minutes of stepping into Haven Grand, I was inside my room with my digital keycard."
              </p>
              <div className="text-[11px] font-mono text-stone-400">
                — Elena M., Hotel Guest
              </div>
            </div>

            <div className="stagger-item p-6 rounded-xl bg-stone-850 border border-stone-800 space-y-4">
              <div className="flex text-amber-400">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-current" />
                ))}
              </div>
              <p className="text-xs text-stone-300 leading-relaxed italic">
                "Stayed at Waterfront hostel lofts for two weeks while working remotely. Perfect WiFi, great quiet rooms, and incredible harbor views."
              </p>
              <div className="text-[11px] font-mono text-stone-400">
                — Marcus T., Remote Software Engineer
              </div>
            </div>

            <div className="stagger-item p-6 rounded-xl bg-stone-850 border border-stone-800 space-y-4">
              <div className="flex text-amber-400">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-current" />
                ))}
              </div>
              <p className="text-xs text-stone-300 leading-relaxed italic">
                "Moving across states is stressful, but Haven's residential onboarding was completely straightforward. Verified my ID online and had a move-in ready apartment."
              </p>
              <div className="text-[11px] font-mono text-stone-400">
                — Sarah L., 6-Month Resident
              </div>
            </div>
          </Stagger>
        </div>
      </section>

      {/* Call to Action */}
      <section className="max-w-4xl mx-auto px-6 text-center space-y-6">
        <Reveal direction="up">
          <div className="p-10 rounded-3xl bg-amber-50/80 border border-amber-200/80 space-y-4">
            <h2 className="text-3xl font-serif font-bold text-slate-900">
              Ready to Experience Haven Stays?
            </h2>
            <p className="text-sm text-slate-600 max-w-lg mx-auto">
              Create your account in seconds. Once registered, manage check-in preferences and view your reservation itinerary anytime.
            </p>
            <div className="pt-2">
              <Link
                href="/signup"
                className="px-8 py-3.5 rounded-full bg-slate-900 text-white text-xs font-semibold tracking-wider uppercase hover:bg-slate-800 transition-colors inline-block"
              >
                Create Guest Profile
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
