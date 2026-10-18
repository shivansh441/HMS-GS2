import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import { AdminSidebar } from "./AdminSidebar";
import { AdminTopBar } from "./AdminTopBar";

export const AdminLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-indigo-600 selection:text-white">
      {/* Top Navigation Bar */}
      <AdminTopBar
        collapsed={collapsed}
        onToggleSidebar={() => setCollapsed(!collapsed)}
      />

      {/* Main Container with Collapsible Sidebar & Dynamic Nested Content */}
      <div className="flex-1 flex overflow-hidden">
        <AdminSidebar
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(!collapsed)}
        />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 scrollbar-thin scrollbar-thumb-zinc-800">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
