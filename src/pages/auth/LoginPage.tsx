import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Building2, ShieldCheck, AlertCircle, Lock, Mail, ArrowRight } from "lucide-react";
import { useAuth, PRESET_CREDENTIALS } from "@/src/contexts/AuthContext";
import { UserRole } from "@/src/types/property";

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login, isLoading, authError, clearAuthError } = useAuth();

  const [email, setEmail] = useState("director@grandstay.com");
  const [password, setPassword] = useState("Admin2026!Secure");
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearAuthError();
    try {
      await login(email, password);
      navigate("/admin/dashboard");
    } catch (err: any) {
      setLocalError(err.message || "Invalid credentials provided.");
    }
  };

  const handleSelectPreset = (role: UserRole) => {
    const creds = PRESET_CREDENTIALS[role];
    if (creds) {
      setEmail(creds.email);
      setPassword(creds.pass);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col justify-center items-center p-4 selection:bg-indigo-600 selection:text-white">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center mx-auto shadow-md">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Sign in to GrandStay</h1>
          <p className="text-xs text-zinc-400">
            Administrative Management &amp; Customer Portal
          </p>
        </div>

        {/* Error Alert */}
        {(localError || authError) && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{localError || authError}</span>
          </div>
        )}

        {/* Sign In Form */}
        <form onSubmit={handleSubmit} className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-300">Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="staff@grandstay.com"
                className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-300">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {isLoading ? "Authenticating..." : "Sign in to Workspace"}
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </form>

        {/* Role Presets for Quick Evaluation */}
        <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-2.5">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-semibold">
            <span>Quick Login Presets</span>
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => handleSelectPreset("super_admin")}
              className="p-1.5 rounded bg-zinc-950 hover:bg-zinc-850 text-left border border-zinc-800/80 text-zinc-300 text-[11px]"
            >
              <span className="font-semibold block text-indigo-400">Super Admin</span>
              Julian Vance (Global)
            </button>
            <button
              type="button"
              onClick={() => handleSelectPreset("property_manager")}
              className="p-1.5 rounded bg-zinc-950 hover:bg-zinc-850 text-left border border-zinc-800/80 text-zinc-300 text-[11px]"
            >
              <span className="font-semibold block text-amber-400">Manager</span>
              Clara Ross (Edinburgh)
            </button>
            <button
              type="button"
              onClick={() => handleSelectPreset("front_desk")}
              className="p-1.5 rounded bg-zinc-950 hover:bg-zinc-850 text-left border border-zinc-800/80 text-zinc-300 text-[11px]"
            >
              <span className="font-semibold block text-sky-400">Front Desk</span>
              Liam Chen (London)
            </button>
            <button
              type="button"
              onClick={() => handleSelectPreset("guest")}
              className="p-1.5 rounded bg-zinc-950 hover:bg-zinc-850 text-left border border-zinc-800/80 text-zinc-300 text-[11px]"
            >
              <span className="font-semibold block text-emerald-400">Customer</span>
              Sofia Berg (Guest)
            </button>
          </div>
        </div>

        <div className="text-center text-xs text-zinc-500">
          <Link to="/" className="hover:text-zinc-300 transition-colors">
            ← Return to Public Discover Portal
          </Link>
        </div>
      </div>
    </div>
  );
};
