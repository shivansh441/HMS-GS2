/**
 * Dashboard typed contracts and data models according to Phase 4 specification.
 */

export interface DashboardMetricSummary {
  totalOccupancyPercentage: number | null;
  occupiedRoomsOrBeds: number | null;
  totalCapacity: number | null;
  activeReservationsCount: number | null;
  pendingCheckInsToday: number | null;
  pendingCheckOutsToday: number | null;
  pendingPaymentsCount: number | null;
  pendingDuesTotalAmount: number | null;
  currency: string;
}

export interface RecentActivityItem {
  id: string;
  timestamp: string;
  category: "reservation" | "front_desk" | "housekeeping" | "payment" | "security" | "system";
  actor: {
    name: string;
    role: string;
  };
  description: string;
  entityReference?: string;
  propertyId: string;
}

export interface OccupancyBreakdown {
  propertyId: string;
  propertyName: string;
  propertyType: "hostel" | "hotel" | "hybrid";
  dormBedsTotal: number;
  dormBedsOccupied: number;
  privateRoomsTotal: number;
  privateRoomsOccupied: number;
  totalOccupancyRate: number; // 0 to 100
}

export interface RecentReservationItem {
  id: string;
  bookingReference: string;
  guestName: string;
  guestEmail: string;
  checkInDate: string;
  checkOutDate: string;
  status: "confirmed" | "pending" | "checked_in" | "checked_out" | "cancelled";
  roomOrUnitName: string;
  totalAmount: number;
  currency: string;
  depositPaid: number;
}

export interface PendingDueItem {
  id: string;
  bookingReference: string;
  guestName: string;
  dueDate: string;
  amountDue: number;
  currency: string;
  paymentType: "room_fee" | "linen_deposit" | "keycard_deposit" | "damage_deposit" | "restaurant";
  status: "pending" | "overdue";
}

export interface DashboardDataContract {
  summary: DashboardMetricSummary;
  recentActivities: RecentActivityItem[];
  occupancy: OccupancyBreakdown[];
  recentReservations: RecentReservationItem[];
  pendingDues: PendingDueItem[];
}
