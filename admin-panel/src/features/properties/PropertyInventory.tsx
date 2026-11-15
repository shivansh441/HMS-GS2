import React, { useEffect, useMemo, useState } from 'react';
import { AxiosError } from 'axios';
import { ArrowRightLeft, BedDouble, Building2, CheckCircle2, ChevronDown, Pencil, Plus, Save, Trash2, UserRoundPlus, X } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { apiClient } from '../../lib/api';
import { LoadingIndicator } from '../../components/ui/LoadingIndicator';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Property, User, UserListResponse } from '../../types';

interface InventoryBed {
  id: string;
  unitNumber: string;
  category: string;
  sharingType: string | null;
  status: string;
  baseRateMonthly: number | string | null;
  defaultPricePerNight: number | string | null;
}

interface InventoryRoom {
  id: string;
  unitNumber: string;
  type: 'ROOM' | 'SUITE' | 'BED';
  category: string;
  sharingType: string | null;
  capacity: number;
  status: string;
  baseRateMonthly: number | string | null;
  defaultPricePerNight: number | string | null;
  beds: InventoryBed[];
}

interface InventoryFloor {
  floorNumber: number;
  rooms: InventoryRoom[];
}

interface PropertyDetails extends Property {
  address: string;
  city: string;
  state: string;
  currency: string;
  unitMatrix: InventoryFloor[];
  feeConfigs: PropertyFeeConfig[];
}

interface PropertyFeeConfig {
  id: string;
  feeType: string;
  name: string;
  amount: number | string | null;
  ratePerUnit: number | string | null;
  unitOfMeasure: string | null;
  isActive: boolean;
}

interface StayAssignment {
  id: string;
  unitId: string;
  userId: string;
  status: string;
  billingStrategy: 'PER_NIGHT_STAY' | 'RECURRING_MONTHLY';
  agreedRate: number | string | null;
  standardRate: number | string | null;
  expectedCheckIn: string;
  expectedCheckOut: string | null;
  guestName: string | null;
  guestEmail: string | null;
  unitNumber: string | null;
}

type RoomCapacityType = 'SINGLE' | 'DOUBLE' | 'TRIPLE' | 'QUAD' | 'DORM';
type RoomCapacityFilter = 'ALL' | RoomCapacityType;

interface InventoryForm {
  unitNumber: string;
  floor: number;
  unitType: 'ROOM' | 'SUITE';
  category: string;
  capacity: number;
  bedsPerRoom: number;
  sharingType: string;
  baseRateMonthly: string;
  defaultPricePerNight: string;
}

const emptyForm: InventoryForm = {
  unitNumber: '',
  floor: 0,
  unitType: 'ROOM',
  category: 'CLASSIC',
  capacity: 2,
  bedsPerRoom: 2,
  sharingType: 'DOUBLE',
  baseRateMonthly: '',
  defaultPricePerNight: '',
};

const hostelTypes = ['HOSTEL_BOYS', 'HOSTEL_GIRLS', 'HOSTEL_COED', 'CO_LIVING'];
const inputClass =
  'w-full border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white';
const inventoryFilterClass =
  'border border-slate-300 bg-white px-2.5 py-1 text-xs font-mono text-slate-700 hover:bg-slate-100 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700';
function getRoomCapacityType(capacity: number): RoomCapacityType {
  if (capacity <= 1) return 'SINGLE';
  if (capacity === 2) return 'DOUBLE';
  if (capacity === 3) return 'TRIPLE';
  if (capacity === 4) return 'QUAD';
  return 'DORM';
}

function getRoomCapacityLabel(capacity: number): string {
  switch (getRoomCapacityType(capacity)) {
    case 'SINGLE': return 'Single bed';
    case 'DOUBLE': return 'Double sharing';
    case 'TRIPLE': return 'Triple sharing';
    case 'QUAD': return 'Quad sharing';
    case 'DORM': return 'Dorm';
  }
}

function getRoomStatusClass(status: string): string {
  if (status === 'AVAILABLE') {
    return 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-900/30 dark:text-emerald-300';
  }
  if (status === 'PARTIAL') {
    return 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-900/30 dark:text-amber-300';
  }
  if (status === 'OCCUPIED') {
    return 'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-900/30 dark:text-rose-300';
  }
  return 'bg-slate-100 text-slate-700 ring-slate-500/20 dark:bg-slate-700 dark:text-slate-300';
}

function formatInventoryLabel(value: string): string {
  return value.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatInventoryRate(
  amount: number | string | null,
  currency: string,
  billingStrategy: StayAssignment['billingStrategy'],
): string {
  if (amount == null) return '—';
  const cadence = billingStrategy === 'RECURRING_MONTHLY' ? '/month' : '/night';
  return `${amount} ${currency} ${cadence}`;
}

function getRoomRateLabel(room: InventoryRoom, propertyType: string, currency: string): string {
  if (hostelTypes.includes(propertyType)) {
    const bedRates = room.beds
      .map((bed) => bed.baseRateMonthly ?? room.baseRateMonthly)
      .filter((rate): rate is number | string => rate != null);
    const uniqueRates = Array.from(new Set(bedRates.map(String)));
    if (uniqueRates.length > 1) return 'Varies by bed';
    const monthlyRate = uniqueRates[0] ?? room.baseRateMonthly;
    return formatInventoryRate(monthlyRate, currency, 'RECURRING_MONTHLY');
  }
  return formatInventoryRate(room.defaultPricePerNight, currency, 'PER_NIGHT_STAY');
}

function getAssignmentRateLabel(assignment: StayAssignment, room: InventoryRoom, currency: string): string {
  const assignedBed = room.beds.find((bed) => bed.id === assignment.unitId);
  const configuredRate = assignment.billingStrategy === 'RECURRING_MONTHLY'
    ? assignedBed?.baseRateMonthly ?? room.baseRateMonthly
    : assignedBed?.defaultPricePerNight ?? room.defaultPricePerNight;
  return formatInventoryRate(
    assignment.agreedRate ?? assignment.standardRate ?? configuredRate,
    currency,
    assignment.billingStrategy,
  );
}

function getErrorMessage(error: unknown) {
  const axiosError = error as AxiosError<{ error?: { message?: string } }>;
  return axiosError.response?.data?.error?.message || axiosError.message || 'Unable to load inventory.';
}

export const PropertyInventory: React.FC = () => {
  const { user, selectedPropertyId, properties } = useAuth();
  const allPropertiesSelected = selectedPropertyId === 'ALL';
  const activePropertyId = selectedPropertyId && selectedPropertyId !== 'ALL' ? selectedPropertyId : '';
  const [property, setProperty] = useState<PropertyDetails | null>(null);
  const [floors, setFloors] = useState<InventoryFloor[]>([]);
  const [allPropertyInventories, setAllPropertyInventories] = useState<
    Array<{
      property: Property;
      floors: InventoryFloor[];
      assignments: StayAssignment[];
      scheduledAssignments: StayAssignment[];
    }>
  >([]);
  const [inventoryPropertyFilter, setInventoryPropertyFilter] = useState('ALL');
  const [occupancyFilter, setOccupancyFilter] = useState<'ALL' | 'VACANT' | 'PARTIAL' | 'FULL'>('ALL');
  const [floorFilter, setFloorFilter] = useState<number | 'ALL'>('ALL');
  const [roomCapacityFilter, setRoomCapacityFilter] = useState<RoomCapacityFilter>('ALL');
  const [form, setForm] = useState<InventoryForm>(emptyForm);
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [unitToDelete, setUnitToDelete] = useState<InventoryRoom | null>(null);
  const [deletingUnit, setDeletingUnit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [deskOpen, setDeskOpen] = useState(false);
  const [deskUserId, setDeskUserId] = useState('');
  const [deskCustomers, setDeskCustomers] = useState<User[]>([]);
  const [deskOptionsLoading, setDeskOptionsLoading] = useState(false);
  const [deskOptionsError, setDeskOptionsError] = useState('');
  const [activeAssignments, setActiveAssignments] = useState<StayAssignment[]>([]);
  const [scheduledAssignments, setScheduledAssignments] = useState<StayAssignment[]>([]);
  const [deskUnitId, setDeskUnitId] = useState('');
  const [deskCheckIn, setDeskCheckIn] = useState(new Date().toISOString().slice(0, 10));
  const [deskRate, setDeskRate] = useState('');
  const [deskRateOverrideReason, setDeskRateOverrideReason] = useState('');
  const [deskDepositAmount, setDeskDepositAmount] = useState('0');
  const [deskDepositMethod, setDeskDepositMethod] = useState('CASH');
  const [deskSaving, setDeskSaving] = useState(false);
  const [roomChangeAssignment, setRoomChangeAssignment] = useState<StayAssignment | null>(null);
  const [roomChangeUnitId, setRoomChangeUnitId] = useState('');
  const [roomChangeSaving, setRoomChangeSaving] = useState(false);
  const [scheduledCheckInAssignment, setScheduledCheckInAssignment] = useState<StayAssignment | null>(null);
  const [scheduledCheckInSaving, setScheduledCheckInSaving] = useState(false);

  const isHotel = property?.type === 'HOTEL';
  const isHostel = hostelTypes.includes(property?.type || '');
  const canDeskCheckIn = user?.role === 'ADMIN' || user?.staffRole === 'FRONT_DESK';
  const rooms = useMemo(
    () => floors.flatMap((floor) => floor.rooms).filter((unit) => unit.type !== 'BED'),
    [floors],
  );
  const totalBeds = useMemo(
    () => floors.flatMap((floor) => floor.rooms).reduce((total, room) => total + room.beds.length, 0),
    [floors],
  );
  const occupancyCounts = useMemo(() => rooms.reduce(
    (counts, room) => {
      if (room.status === 'AVAILABLE') counts.vacant += 1;
      else if (room.status === 'PARTIAL') counts.partial += 1;
      else if (room.status === 'OCCUPIED') counts.full += 1;
      return counts;
    },
    { vacant: 0, partial: 0, full: 0 },
  ), [rooms]);
  const filteredFloors = useMemo(
    () => floors
      .map((floor) => ({
        ...floor,
        rooms: floor.rooms.filter((room) => {
          if (room.type === 'BED') return false;
          const matchesOccupancy = occupancyFilter === 'ALL'
            || (occupancyFilter === 'VACANT' && room.status === 'AVAILABLE')
            || (occupancyFilter === 'PARTIAL' && room.status === 'PARTIAL')
            || (occupancyFilter === 'FULL' && room.status === 'OCCUPIED');
          const matchesCapacity = roomCapacityFilter === 'ALL'
            || getRoomCapacityType(room.capacity) === roomCapacityFilter;
          return matchesOccupancy && matchesCapacity;
        }),
      }))
      .filter((floor) => floor.rooms.length > 0),
    [floors, occupancyFilter, roomCapacityFilter],
  );
  const floorNumbers = useMemo(
    () => Array.from({ length: Math.max(0, property?.floors ?? 0) + 1 }, (_, floorNumber) => floorNumber),
    [property?.floors],
  );
  const visibleFloors = floorFilter === 'ALL'
    ? filteredFloors
    : floorNumbers
      .filter((floorNumber) => floorNumber === floorFilter)
      .map((floorNumber) => ({
        floorNumber,
        rooms: filteredFloors.find((floor) => floor.floorNumber === floorNumber)?.rooms ?? [],
      }));
  const filteredRoomCount = visibleFloors.reduce((total, floor) => total + floor.rooms.length, 0);

  const loadInventory = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const [propertyResponse, matrixResponse, feeResponse, assignmentsResponse, scheduledResponse] = await Promise.all([
        apiClient.get<PropertyDetails>(`/admin/properties/${encodeURIComponent(activePropertyId)}`),
        apiClient.get<{ floors: InventoryFloor[] }>(`/properties/${encodeURIComponent(activePropertyId)}/units/matrix`),
        apiClient.get<PropertyFeeConfig[]>(`/properties/${encodeURIComponent(activePropertyId)}/fees`),
        canDeskCheckIn
          ? apiClient.get<StayAssignment[]>(`/stay/assignments/active?propertyId=${encodeURIComponent(activePropertyId)}`)
          : Promise.resolve({ data: [] as StayAssignment[] }),
        canDeskCheckIn
          ? apiClient.get<StayAssignment[]>(`/stay/assignments/scheduled?propertyId=${encodeURIComponent(activePropertyId)}`)
          : Promise.resolve({ data: [] as StayAssignment[] }),
      ]);
      const feeConfigs = propertyResponse.data.feeConfigs?.length
        ? propertyResponse.data.feeConfigs
        : feeResponse.data;
      setProperty({ ...propertyResponse.data, feeConfigs });
      setFloorFilter('ALL');
      setFloors(matrixResponse.data.floors || propertyResponse.data.unitMatrix || []);
      setActiveAssignments(assignmentsResponse.data);
      setScheduledAssignments(scheduledResponse.data);
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (allPropertiesSelected) {
      const loadAllInventories = async () => {
        setLoading(true);
        setErrorMessage('');
        setProperty(null);
        try {
          const inventories = await Promise.all(properties.map(async (availableProperty) => {
            const [matrixResponse, assignmentsResponse, scheduledResponse] = await Promise.all([
              apiClient.get<{ floors: InventoryFloor[] }>(
                `/properties/${encodeURIComponent(availableProperty.id)}/units/matrix`,
              ),
              canDeskCheckIn
                ? apiClient.get<StayAssignment[]>(`/stay/assignments/active?propertyId=${encodeURIComponent(availableProperty.id)}`)
                : Promise.resolve({ data: [] as StayAssignment[] }),
              canDeskCheckIn
                ? apiClient.get<StayAssignment[]>(`/stay/assignments/scheduled?propertyId=${encodeURIComponent(availableProperty.id)}`)
                : Promise.resolve({ data: [] as StayAssignment[] }),
            ]);
            return {
              property: availableProperty,
              floors: matrixResponse.data.floors || [],
              assignments: assignmentsResponse.data,
              scheduledAssignments: scheduledResponse.data,
            };
          }));
          setAllPropertyInventories(inventories);
        } catch (error: unknown) {
          setAllPropertyInventories([]);
          setErrorMessage(getErrorMessage(error));
        } finally {
          setLoading(false);
        }
      };
      void loadAllInventories();
      return;
    }

    setAllPropertyInventories([]);
    if (activePropertyId) {
      void loadInventory();
    } else {
      setLoading(false);
    }
  }, [activePropertyId, allPropertiesSelected, properties]);

  useEffect(() => {
    if (!deskOpen) return;
    let active = true;
    const loadDeskOptions = async () => {
      setDeskOptionsLoading(true);
      setDeskOptionsError('');
      try {
        const [firstPage, assignmentsResponse] = await Promise.all([
          apiClient.get<UserListResponse>('/admin/users?role=CUSTOMER&limit=100&offset=0'),
          apiClient.get<StayAssignment[]>(`/stay/assignments/active?propertyId=${encodeURIComponent(activePropertyId)}`),
        ]);
        const customers = [...firstPage.data.items];
        for (let offset = customers.length; offset < firstPage.data.total; offset += 100) {
          const response = await apiClient.get<UserListResponse>(
            `/admin/users?role=CUSTOMER&limit=100&offset=${offset}`,
          );
          customers.push(...response.data.items);
        }
        if (active) {
          const assignedUserIds = new Set(assignmentsResponse.data.map((assignment) => assignment.userId));
          setDeskCustomers(customers.filter(
            (customer) => customer.role === 'CUSTOMER'
              && customer.status === 'ACTIVE'
              && !assignedUserIds.has(customer.id),
          ));
          setActiveAssignments(assignmentsResponse.data);
        }
      } catch (error: unknown) {
        if (active) setDeskOptionsError(getErrorMessage(error));
      } finally {
        if (active) setDeskOptionsLoading(false);
      }
    };
    void loadDeskOptions();
    return () => {
      active = false;
    };
  }, [deskOpen, activePropertyId]);

  const createUnit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!property) return;
    setSaving(true);
    setErrorMessage('');
    setSuccessMessage('');
    const payload = {
      unitNumber: form.unitNumber.trim(),
      floor: form.floor,
      type: isHostel ? 'ROOM' : form.unitType,
      category: isHostel
        ? form.sharingType === 'DORMITORY' ? 'DORMITORY' : 'CLASSIC'
        : form.category,
      capacity: isHostel
        ? form.sharingType === 'DORMITORY'
          ? form.bedsPerRoom
          : ({ SINGLE: 1, DOUBLE: 2, TRIPLE: 3 }[form.sharingType] || form.bedsPerRoom)
        : form.capacity,
      ...(isHostel ? {
        bedsPerRoom: form.sharingType === 'DORMITORY'
          ? form.bedsPerRoom
          : ({ SINGLE: 1, DOUBLE: 2, TRIPLE: 3 }[form.sharingType] || form.bedsPerRoom),
        sharingType: form.sharingType,
        baseRateMonthly: form.baseRateMonthly,
      } : {}),
      ...(!isHostel && form.defaultPricePerNight ? { defaultPricePerNight: form.defaultPricePerNight } : {}),
    };
    try {
      if (editingUnitId) {
        await apiClient.put(`/units/${encodeURIComponent(editingUnitId)}`, payload);
      } else {
        await apiClient.post(`/properties/${encodeURIComponent(property.id)}/units`, payload);
      }
      setForm(emptyForm);
      setEditingUnitId(null);
      setIsCreating(false);
      setSuccessMessage(editingUnitId
        ? 'Room updated.'
        : isHostel
          ? `Room added with ${form.bedsPerRoom} configured bed${form.bedsPerRoom === 1 ? '' : 's'}.`
          : 'Room added.');
      await loadInventory();
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const editRoom = (room: InventoryRoom, floor: number) => {
    setEditingUnitId(room.id);
    setForm({
      unitNumber: room.unitNumber,
      floor,
      unitType: room.type === 'SUITE' ? 'SUITE' : 'ROOM',
      category: room.category,
      capacity: room.capacity,
      bedsPerRoom: room.beds.length || room.capacity,
      sharingType: room.sharingType || 'SINGLE',
      baseRateMonthly: String(room.baseRateMonthly ?? ''),
      defaultPricePerNight: String(room.defaultPricePerNight ?? ''),
    });
    setErrorMessage('');
    setSuccessMessage('');
    setIsCreating(true);
  };

  const deleteRoom = async () => {
    if (!unitToDelete) return;
    setDeletingUnit(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      await apiClient.delete(`/units/${encodeURIComponent(unitToDelete.id)}`);
      setSuccessMessage(`${unitToDelete.unitNumber} was removed from active inventory.`);
      setUnitToDelete(null);
      await loadInventory();
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setDeletingUnit(false);
    }
  };

  const scheduleRoomChange = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!roomChangeAssignment) return;
    setRoomChangeSaving(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      await apiClient.post(
        `/stay/assignments/${encodeURIComponent(roomChangeAssignment.id)}/change-room`,
        roomChangeUnitId ? { newUnitId: roomChangeUnitId } : {},
      );
      setRoomChangeAssignment(null);
      setRoomChangeUnitId('');
      setSuccessMessage(
        roomChangeUnitId
          ? 'Room change scheduled for the next calendar month. The new room is reserved.'
          : 'Deassignment scheduled for the end of this month.',
      );
      await loadInventory();
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setRoomChangeSaving(false);
    }
  };

  const checkInScheduledRoomChange = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!scheduledCheckInAssignment) return;
    setScheduledCheckInSaving(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const depositConfig = property?.feeConfigs.find(
        (fee) => fee.feeType === 'SECURITY_DEPOSIT' && fee.isActive,
      );
      await apiClient.post(
        `/stay/assignments/${encodeURIComponent(scheduledCheckInAssignment.id)}/check-in`,
        depositConfig
          ? {
              depositPaymentAmount: deskDepositAmount,
              depositPaymentMethod: deskDepositMethod,
            }
          : {},
      );
      setScheduledCheckInAssignment(null);
      setSuccessMessage('Room change is now active.');
      await loadInventory();
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setScheduledCheckInSaving(false);
    }
  };

  const createDeskAssignment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!property) return;
    setDeskSaving(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const depositConfig = property.feeConfigs.find(
        (fee) => fee.feeType === 'SECURITY_DEPOSIT' && fee.isActive,
      );
      await apiClient.post('/stay/assignments', {
        unitId: deskUnitId,
        userId: deskUserId.trim(),
        expectedCheckIn: `${deskCheckIn}T12:00:00Z`,
        billingStrategy: isHostel ? 'RECURRING_MONTHLY' : 'PER_NIGHT_STAY',
        ...(deskRate ? { agreedRate: deskRate } : {}),
        ...(deskRateOverrideReason.trim()
          ? { rateOverrideReason: deskRateOverrideReason.trim() }
          : {}),
        ...(depositConfig ? {
          depositPaymentAmount: deskDepositAmount,
          depositPaymentMethod: deskDepositMethod,
        } : {}),
      });
      setDeskOpen(false);
      setDeskUserId('');
      setDeskUnitId('');
      setDeskRate('');
      setDeskRateOverrideReason('');
      setSuccessMessage('Walk-in stay assigned with the standard rate or agreed desk rate.');
      await loadInventory();
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setDeskSaving(false);
    }
  };

  const availableDeskUnits = rooms.flatMap((room) => (
    isHostel ? room.beds.filter((bed) => bed.status === 'AVAILABLE') : [room]
  )).filter((unit) => unit.status === 'AVAILABLE');
  const selectedDeskUnit = availableDeskUnits.find((unit) => unit.id === deskUnitId);
  const deskHasRateOverride = Boolean(
    selectedDeskUnit &&
    deskRate !== '' &&
    (isHostel ? selectedDeskUnit.baseRateMonthly : selectedDeskUnit.defaultPricePerNight) != null &&
    Number(deskRate) !== Number(isHostel ? selectedDeskUnit.baseRateMonthly : selectedDeskUnit.defaultPricePerNight),
  );

  if (!activePropertyId && !allPropertiesSelected) {
    return (
      <div className="space-y-5">
        <header className="border-b border-slate-200 pb-4 dark:border-slate-800">
          <h1 className="text-xl font-bold uppercase tracking-wide">Unit inventory</h1>
          <p className="mt-1 text-xs text-slate-500">
            Select a property from Property Scope in the navbar to view its inventory.
          </p>
        </header>
        <p className="border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          Choose a property or “All Properties” in the navbar to view inventory.
        </p>
      </div>
    );
  }

  if (loading) {
    return <LoadingIndicator label="Loading property inventory" className="p-8" />;
  }

  if (allPropertiesSelected) {
    const allRooms = allPropertyInventories.flatMap(({ floors: propertyFloors }) =>
      propertyFloors.flatMap((floor) => floor.rooms).filter((room) => room.type !== 'BED'),
    );
    const totalBeds = allRooms.reduce((total, room) => total + room.beds.length, 0);
    const inventoryRooms = allPropertyInventories.flatMap(({
      property: inventoryProperty,
      floors: propertyFloors,
      assignments,
      scheduledAssignments: propertyScheduledAssignments,
    }) =>
      propertyFloors.flatMap((floor) => floor.rooms
        .filter((room) => room.type !== 'BED')
        .map((room) => ({
          property: inventoryProperty,
          floorNumber: floor.floorNumber,
          room,
          assignments: assignments.filter(
            (assignment) => assignment.unitId === room.id || room.beds.some((bed) => bed.id === assignment.unitId),
          ),
          scheduledAssignments: propertyScheduledAssignments.filter(
            (assignment) => assignment.unitId === room.id || room.beds.some((bed) => bed.id === assignment.unitId),
          ),
        }))),
    );
    const filteredInventoryRooms = inventoryRooms
      .filter(({ property: inventoryProperty }) =>
        inventoryPropertyFilter === 'ALL' || inventoryProperty.id === inventoryPropertyFilter);
    const propertiesWithoutRooms = allPropertyInventories.filter(({ property: inventoryProperty }) =>
      (inventoryPropertyFilter === 'ALL' || inventoryProperty.id === inventoryPropertyFilter)
      && !inventoryRooms.some(({ property: roomProperty }) => roomProperty.id === inventoryProperty.id),
    );
    if (errorMessage) {
      return (
        <div role="alert" className="border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          {errorMessage}
        </div>
      );
    }

    return (
      <div className="space-y-5">
        <header className="border-b border-slate-200 pb-4 dark:border-slate-800">
          <h1 className="text-xl font-bold uppercase tracking-wide">All properties unit inventory</h1>
          <p className="mt-1 text-xs text-slate-500">
            Inventory across {allPropertyInventories.length} accessible properties.
          </p>
        </header>

        <section className="grid gap-3 sm:grid-cols-3" aria-label="All property inventory summary">
          {[
            ['Properties', allPropertyInventories.length],
            ['Rooms / suites', allRooms.length],
            ['Configured beds', totalBeds],
          ].map(([label, count]) => (
            <div key={label} className="border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
              <p className="text-2xl font-bold">{count}</p>
              <p className="mt-1 text-xs uppercase text-slate-500">{label}</p>
            </div>
          ))}
        </section>

        {allPropertyInventories.length > 0 && (
          <section aria-label="Filter inventory by property">
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter inventory by property">
                <button
                  type="button"
                  role="tab"
                  aria-selected={inventoryPropertyFilter === 'ALL'}
                  onClick={() => setInventoryPropertyFilter('ALL')}
                  className={`border px-3 py-2 text-xs font-bold uppercase ${
                    inventoryPropertyFilter === 'ALL'
                      ? 'border-slate-900 bg-slate-900 text-white dark:border-blue-600 dark:bg-blue-600'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  All Properties
                </button>
                {allPropertyInventories.map(({ property: inventoryProperty }) => (
                  <button
                    key={inventoryProperty.id}
                    type="button"
                    role="tab"
                    aria-selected={inventoryPropertyFilter === inventoryProperty.id}
                    onClick={() => setInventoryPropertyFilter(inventoryProperty.id)}
                    className={`border px-3 py-2 text-xs font-bold uppercase ${
                      inventoryPropertyFilter === inventoryProperty.id
                        ? 'border-slate-900 bg-slate-900 text-white dark:border-blue-600 dark:bg-blue-600'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {inventoryProperty.name}
                  </button>
                ))}
            </div>
          </section>
        )}

        {allPropertyInventories.length === 0 ? (
          <p className="border border-slate-200 bg-white p-6 text-center text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800">
            No accessible properties have inventory.
          </p>
        ) : filteredInventoryRooms.length === 0 && propertiesWithoutRooms.length === 0 ? (
          <p className="border border-slate-200 bg-white p-6 text-center text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800">
            No rooms match the selected property.
          </p>
        ) : (
          <div className="overflow-x-auto border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-300 bg-slate-100 font-mono text-[11px] uppercase tracking-wider text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                  {inventoryPropertyFilter === 'ALL' && <th className="px-3 py-2.5 font-semibold">Property</th>}
                  <th className="px-3 py-2.5 font-semibold">Room no.</th>
                  <th className="px-3 py-2.5 font-semibold">Floor no.</th>
                  <th className="px-3 py-2.5 font-semibold">Room status</th>
                  <th className="px-3 py-2.5 font-semibold">Room type</th>
                  <th className="px-3 py-2.5 font-semibold">Actual rate of room</th>
                  <th className="px-3 py-2.5 font-semibold">Assigned to</th>
                  <th className="px-3 py-2.5 font-semibold">Bed / capacity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono dark:divide-slate-700">
            {filteredInventoryRooms.map(({ property: inventoryProperty, floorNumber, room, assignments, scheduledAssignments: roomScheduledAssignments }) => {
              const isPropertyHotel = inventoryProperty.type === 'HOTEL';
              const filledBeds = room.beds.length > 0
                ? room.beds.filter((bed) => bed.status === 'OCCUPIED').length
                : Math.min(assignments.filter((assignment) => assignment.status === 'CHECKED_IN').length, room.capacity);
              const totalBeds = room.beds.length || room.capacity;
              return (
              <tr key={`${inventoryProperty.id}-${room.id}`} className="bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-750">
                {inventoryPropertyFilter === 'ALL' && (
                  <td className="px-3 py-2.5">
                    <div className="font-sans font-medium text-slate-900 dark:text-white">{inventoryProperty.name}</div>
                    <div className="mt-0.5 text-[10px] text-slate-500">{inventoryProperty.code} · {formatInventoryLabel(inventoryProperty.type)}</div>
                  </td>
                )}
                <td className="px-3 py-2.5">
                  <div className="font-sans font-medium text-slate-900 dark:text-white">
                    {room.type === 'SUITE' ? 'Suite' : 'Room'} {room.unitNumber}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{floorNumber}</td>
                <td className="px-3 py-2.5">
                  <span className={`inline-block border px-1.5 py-0.5 text-[10px] font-bold uppercase ${getRoomStatusClass(room.status)}`}>
                    {formatInventoryLabel(room.status)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                  {isPropertyHotel
                    ? `${room.type === 'SUITE' ? 'Suite' : 'Room'} · ${formatInventoryLabel(room.category)}`
                    : formatInventoryLabel(room.sharingType || getRoomCapacityType(room.capacity))}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-slate-700 dark:text-slate-300">
                  {getRoomRateLabel(room, inventoryProperty.type, inventoryProperty.currency)}
                </td>
                <td className="px-3 py-2.5">
                  {assignments.length === 0 && roomScheduledAssignments.length === 0 ? (
                    <span className="text-slate-500">Unassigned</span>
                  ) : (
                    <details className="group relative">
                      <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 text-blue-700 hover:text-blue-900 dark:text-blue-300">
                        <span>
                          {assignments.length} assigned
                          {roomScheduledAssignments.length > 0 && ` · ${roomScheduledAssignments.length} scheduled`}
                        </span>
                        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="absolute left-0 top-full z-20 mt-1 min-w-56 border border-slate-300 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                        {assignments.map((assignment) => (
                          <div key={assignment.id} className="border-b border-slate-200 px-2 py-2 last:border-0 dark:border-slate-700">
                            <span className="block font-sans font-medium text-slate-900 dark:text-white">
                              {assignment.guestName || assignment.guestEmail || 'Guest'}
                            </span>
                            {assignment.unitNumber && <span className="text-[10px] text-slate-500">{assignment.unitNumber}</span>}
                            <span className="mt-1 block text-[10px] text-slate-600 dark:text-slate-300">
                              Actual rate: {getAssignmentRateLabel(assignment, room, inventoryProperty.currency)}
                            </span>
                          </div>
                        ))}
                        {roomScheduledAssignments.map((assignment) => (
                          <div key={assignment.id} className="border-b border-slate-200 px-2 py-2 last:border-0 dark:border-slate-700">
                            <span className="block font-sans font-medium text-slate-900 dark:text-white">
                              {assignment.guestName || assignment.guestEmail || 'Guest'} · Scheduled
                            </span>
                            <span className="text-[10px] text-slate-500">
                              Effective {new Date(assignment.expectedCheckIn).toLocaleDateString()}
                            </span>
                            <span className="mt-1 block text-[10px] text-slate-600 dark:text-slate-300">
                              Actual rate: {getAssignmentRateLabel(assignment, room, inventoryProperty.currency)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </td>
                <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{filledBeds}/{totalBeds}</td>
              </tr>
            );})}
            {propertiesWithoutRooms.map(({ property: inventoryProperty }) => (
              <tr key={inventoryProperty.id} className="hover:bg-slate-50 dark:hover:bg-slate-750">
                <td colSpan={inventoryPropertyFilter === 'ALL' ? 8 : 7} className="px-3 py-2.5 text-slate-500">
                  {inventoryProperty.name} · {inventoryProperty.code}: no rooms have been added.
                </td>
              </tr>
            ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  if (!property) {
    return (
      <div role="alert" className="border border-red-300 bg-red-50 p-4 text-sm text-red-800">
        {errorMessage || 'Property not found.'}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div>
          <p className="text-xs font-mono text-slate-500">{property.code} · {property.type}</p>
          <h1 className="mt-1 text-xl font-bold uppercase tracking-wide">
            {isCreating
              ? `${editingUnitId ? 'Edit' : 'Create'} ${isHostel ? 'hostel' : 'hotel'} room`
              : `${property.name} inventory`}
          </h1>
          <p className="mt-1 text-xs text-slate-500">{property.city}, {property.state}</p>
        </div>
        {!isCreating && (
          <div className="flex flex-wrap gap-2">
            {canDeskCheckIn && (
              <button type="button" onClick={() => {
                const deposit = property.feeConfigs.find(
                  (fee) => fee.feeType === 'SECURITY_DEPOSIT' && fee.isActive,
                );
                setDeskUserId('');
                setDeskUnitId('');
                setDeskOptionsError('');
                setDeskDepositAmount(String(deposit?.amount ?? '0'));
                setDeskRate('');
                setDeskRateOverrideReason('');
                setDeskOpen(true);
              }} className="inline-flex items-center gap-2 border border-blue-700 px-3 py-2 text-xs font-bold uppercase text-blue-700 hover:bg-blue-50 dark:text-blue-300">
                <UserRoundPlus className="h-4 w-4" /> Desk walk-in
              </button>
            )}
            {user?.role === 'ADMIN' && (
              <button
                type="button"
                onClick={() => {
                  setForm(emptyForm);
                  setEditingUnitId(null);
                  setErrorMessage('');
                  setSuccessMessage('');
                  setIsCreating(true);
                }}
                className="inline-flex items-center gap-2 bg-blue-700 px-3 py-2 text-xs font-bold uppercase text-white hover:bg-blue-800"
              >
                <Plus className="h-4 w-4" />
                Create room
              </button>
            )}
          </div>
        )}
        {isCreating && (
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setIsCreating(false);
              setEditingUnitId(null);
              setForm(emptyForm);
              setErrorMessage('');
            }}
            className="text-xs font-bold uppercase text-blue-700 hover:text-blue-900 disabled:opacity-60 dark:text-blue-300"
          >
            Back to inventory
          </button>
        )}
      </header>

      {errorMessage && (
        <div role="alert" className="border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
          {errorMessage}
        </div>
      )}
      {successMessage && (
        <div role="status" className="border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
          {successMessage}
        </div>
      )}

      {!isCreating && <section className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-3 border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <Building2 className="h-5 w-5 text-blue-700" />
          <div>
            <p className="text-xl font-bold">{rooms.length}</p>
            <p className="text-xs uppercase text-slate-500">{isHostel ? 'Rooms' : 'Rooms / suites'}</p>
          </div>
        </div>
        {isHostel && (
          <div className="flex items-center gap-3 border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <BedDouble className="h-5 w-5 text-blue-700" />
            <div>
              <p className="text-xl font-bold">{totalBeds}</p>
              <p className="text-xs uppercase text-slate-500">Total configured beds</p>
            </div>
          </div>
        )}
      </section>}

      {user?.role === 'ADMIN' && isCreating ? (
        <section className="space-y-4 border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <div>
              <h2 className="text-sm font-bold uppercase">{editingUnitId ? 'Edit' : 'Add'} {isHostel ? 'hostel room' : 'hotel room'}</h2>
              <p className="mt-1 text-xs text-slate-500">
                {isHostel
                  ? 'Set sharing and the standard monthly baseline; individual bed records are created automatically.'
                  : 'Set the room category and standard nightly rate.'}
              </p>
          </div>
          <form onSubmit={createUnit} className="grid grid-cols-1 gap-3 md:grid-cols-4 md:items-end">
          <label className="space-y-1 text-xs font-semibold">
            Unit number *
            <input required maxLength={64} className={inputClass} value={form.unitNumber} onChange={(event) => setForm((current) => ({ ...current, unitNumber: event.target.value }))} />
          </label>
          <label className="space-y-1 text-xs font-semibold">
            Floor
            <input type="number" min="0" max="100" className={inputClass} value={form.floor} onChange={(event) => setForm((current) => ({ ...current, floor: Number(event.target.value) }))} />
          </label>
          {isHotel && (
            <label className="space-y-1 text-xs font-semibold">
              Unit type
              <select
                className={inputClass}
                value={form.unitType}
                onChange={(event) => setForm((current) => ({
                  ...current,
                  unitType: event.target.value as InventoryForm['unitType'],
                }))}
              >
                <option value="ROOM">Room</option>
                <option value="SUITE">Suite</option>
              </select>
            </label>
          )}
          {isHotel && (
            <label className="space-y-1 text-xs font-semibold">
              Room category
              <select
                className={inputClass}
                value={form.category}
                onChange={(event) => setForm((current) => ({
                  ...current,
                  category: event.target.value,
                  capacity: event.target.value === 'DORMITORY'
                    ? Math.max(4, current.capacity)
                    : current.capacity,
                }))}
              >
                <option value="CLASSIC">Classic</option>
                <option value="DELUXE">Deluxe</option>
                <option value="EXECUTIVE">Executive</option>
                <option value="DORMITORY">Dormitory</option>
              </select>
            </label>
          )}
          {isHostel ? (
            <>
              <label className="space-y-1 text-xs font-semibold">
                Sharing type
                <select className={inputClass} value={form.sharingType} onChange={(event) => setForm((current) => ({
                  ...current,
                  sharingType: event.target.value,
                  bedsPerRoom: event.target.value === 'DORMITORY'
                    ? Math.max(4, current.bedsPerRoom)
                    : current.bedsPerRoom,
                }))}>
                  <option value="SINGLE">Single sharing</option>
                  <option value="DOUBLE">Double sharing</option>
                  <option value="TRIPLE">Triple sharing</option>
                  <option value="DORMITORY">Dormitory</option>
                </select>
              </label>
              {form.sharingType === 'DORMITORY' ? (
                <label className="space-y-1 text-xs font-semibold">
                  Beds in dormitory *
                  <input required type="number" min="4" max="100" className={inputClass} value={form.bedsPerRoom} onChange={(event) => setForm((current) => ({ ...current, bedsPerRoom: Number(event.target.value) }))} />
                </label>
              ) : (
                <div className="space-y-1 text-xs font-semibold">
                  <span>Beds in room</span>
                  <p className={`${inputClass} text-slate-500`}>
                    {form.sharingType === 'SINGLE' ? 1 : form.sharingType === 'DOUBLE' ? 2 : 3}
                  </p>
                </div>
              )}
            </>
          ) : (
            <label className="space-y-1 text-xs font-semibold">
              Occupancy capacity *
              <input required type="number" min={form.category === 'DORMITORY' ? 4 : 1} max="100" className={inputClass} value={form.capacity} onChange={(event) => setForm((current) => ({ ...current, capacity: Number(event.target.value) }))} />
            </label>
          )}
          <label className="space-y-1 text-xs font-semibold">
            {isHostel ? `Standard monthly rate per bed (${property.currency})` : `Standard nightly rate (${property.currency})`}
            <input required type="number" min="0.01" step="0.01" className={inputClass} value={isHostel ? form.baseRateMonthly : form.defaultPricePerNight} onChange={(event) => setForm((current) => isHostel ? { ...current, baseRateMonthly: event.target.value } : { ...current, defaultPricePerNight: event.target.value })} />
          </label>
          <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 bg-blue-700 px-3 py-2 text-xs font-bold uppercase text-white hover:bg-blue-800 disabled:opacity-60">
            {saving || editingUnitId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {editingUnitId ? 'Save changes' : 'Create room'}
          </button>
          </form>
        </section>
      ) : null}

      {!isCreating && <section className="space-y-3">
        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-bold uppercase">Configured rooms and beds</h2>
            <p className="mt-1 text-xs text-slate-500">Filter rooms by floor and current occupancy.</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              aria-pressed={occupancyFilter === 'ALL'}
              onClick={() => setOccupancyFilter('ALL')}
              className={`border px-2.5 py-1 text-xs font-mono ${
                occupancyFilter === 'ALL'
                  ? 'border-slate-900 bg-slate-900 text-white dark:border-blue-600 dark:bg-blue-600'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              All rooms <span className="ml-1 opacity-75">{rooms.length}</span>
            </button>
            <label className="sr-only" htmlFor="inventory-occupancy-filter">Filter rooms by occupancy</label>
            <select
              id="inventory-occupancy-filter"
              value={occupancyFilter}
              onChange={(event) => setOccupancyFilter(event.target.value as typeof occupancyFilter)}
              className={inventoryFilterClass}
            >
              <option value="ALL">Occupancy</option>
              <option value="VACANT">Vacant ({occupancyCounts.vacant})</option>
              <option value="PARTIAL">Partially filled ({occupancyCounts.partial})</option>
              <option value="FULL">Fully filled ({occupancyCounts.full})</option>
            </select>
            <label className="sr-only" htmlFor="inventory-floor-filter">Filter rooms by floor</label>
            <select
              id="inventory-floor-filter"
              value={floorFilter}
              onChange={(event) => setFloorFilter(
                event.target.value === 'ALL' ? 'ALL' : Number(event.target.value),
              )}
              className={inventoryFilterClass}
            >
              <option value="ALL">All floors</option>
              {floorNumbers.map((floorNumber) => (
                <option key={floorNumber} value={floorNumber}>Floor {floorNumber}</option>
              ))}
            </select>
            <label className="sr-only" htmlFor="inventory-room-type-filter">Filter rooms by capacity</label>
            <select
              id="inventory-room-type-filter"
              value={roomCapacityFilter}
              onChange={(event) => setRoomCapacityFilter(event.target.value as RoomCapacityFilter)}
              className={inventoryFilterClass}
            >
              <option value="ALL">All room types</option>
              <option value="SINGLE">Single bed</option>
              <option value="DOUBLE">Double sharing</option>
              <option value="TRIPLE">Triple sharing</option>
              <option value="QUAD">Quad sharing</option>
              <option value="DORM">Dorm (&gt;4 capacity)</option>
            </select>
          </div>
        </div>
        {rooms.length === 0 ? (
          <p className="border border-slate-200 bg-white p-6 text-center text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800">No rooms have been added to this property.</p>
        ) : filteredRoomCount === 0 ? (
          <p className="border border-slate-200 bg-white p-6 text-center text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800">
            {floorFilter === 'ALL'
              ? 'No rooms match this occupancy filter.'
              : `No rooms match the selected floor and occupancy filters.`}
          </p>
        ) : visibleFloors.map((floor) => (
          <div key={floor.floorNumber} className="space-y-3">
            <div className="overflow-x-auto border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-300 bg-slate-100 font-mono text-[11px] uppercase tracking-wider text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                    <th className="px-3 py-2.5 font-semibold">Room no.</th>
                    <th className="px-3 py-2.5 font-semibold">Floor no.</th>
                    <th className="px-3 py-2.5 font-semibold">Room status</th>
                    <th className="px-3 py-2.5 font-semibold">Room type</th>
                    <th className="px-3 py-2.5 font-semibold">Actual rate of room</th>
                    <th className="px-3 py-2.5 font-semibold">Assigned to</th>
                    <th className="px-3 py-2.5 font-semibold">Bed / capacity</th>
                    {user?.role === 'ADMIN' && <th className="px-3 py-2.5 text-right font-semibold">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono dark:divide-slate-700">
            {floor.rooms.map((room) => {
              const roomAssignments = activeAssignments.filter(
                (assignment) => assignment.unitId === room.id || room.beds.some((bed) => bed.id === assignment.unitId),
              );
              const roomScheduledAssignments = scheduledAssignments.filter(
                (assignment) => assignment.unitId === room.id || room.beds.some((bed) => bed.id === assignment.unitId),
              );
              const filledBeds = room.beds.length > 0
                ? room.beds.filter((bed) => bed.status === 'OCCUPIED').length
                : Math.min(roomAssignments.filter((assignment) => assignment.status === 'CHECKED_IN').length, room.capacity);
              const totalBeds = room.beds.length || room.capacity;
              return (
                <tr key={room.id} className="bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-750">
                    <td className="whitespace-nowrap px-3 py-2.5 font-sans font-medium text-slate-900 dark:text-white">{room.unitNumber}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-700 dark:text-slate-300">{floor.floorNumber}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span className={`inline-block border px-1.5 py-0.5 text-[10px] font-bold uppercase ${getRoomStatusClass(room.status)}`}>
                        {formatInventoryLabel(room.status)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-700 dark:text-slate-300">
                      {isHotel
                        ? `${room.type === 'SUITE' ? 'Suite' : 'Room'} · ${formatInventoryLabel(room.category)}`
                        : formatInventoryLabel(room.sharingType || getRoomCapacityType(room.capacity))}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-700 dark:text-slate-300">
                      {getRoomRateLabel(room, property.type, property.currency)}
                    </td>
                    <td className="px-3 py-2.5">
                      {roomAssignments.length === 0 && roomScheduledAssignments.length === 0 ? (
                        <span className="text-slate-500">Unassigned</span>
                      ) : (
                        <details className="group relative">
                          <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 text-blue-700 hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-200">
                            <span>
                              {roomAssignments.length} assigned
                              {roomScheduledAssignments.length > 0 && ` · ${roomScheduledAssignments.length} scheduled`}
                            </span>
                            <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                          </summary>
                          <div className="absolute left-0 top-full z-20 mt-1 min-w-64 border border-slate-300 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                            {roomAssignments.map((assignment) => (
                              <div key={assignment.id} className="flex items-center justify-between gap-3 border-b border-slate-200 px-2 py-2 last:border-0 dark:border-slate-700">
                                <span className="min-w-0">
                                  <span className="block truncate font-sans font-medium text-slate-900 dark:text-white">
                                    {assignment.guestName || assignment.guestEmail || 'Guest'}
                                  </span>
                                  {assignment.unitNumber && <span className="text-[10px] text-slate-500">{assignment.unitNumber}</span>}
                                  <span className="mt-1 block text-[10px] text-slate-600 dark:text-slate-300">
                                    Actual rate: {getAssignmentRateLabel(assignment, room, property.currency)}
                                  </span>
                                </span>
                                {canDeskCheckIn && !assignment.expectedCheckOut && (
                                  <button
                                    type="button"
                                    title="Change or deassign room"
                                    aria-label={`Change or deassign room for ${assignment.guestName || assignment.guestEmail || 'guest'}`}
                                    onClick={() => {
                                      setRoomChangeAssignment(assignment);
                                      setRoomChangeUnitId('');
                                    }}
                                    className="shrink-0 border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                                  >
                                    <ArrowRightLeft className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            ))}
                            {roomScheduledAssignments.map((assignment) => {
                              const effectiveDate = new Date(assignment.expectedCheckIn);
                              const isEffective = effectiveDate.getTime() <= Date.now();
                              return (
                                <div key={assignment.id} className="flex items-center justify-between gap-3 border-b border-slate-200 px-2 py-2 last:border-0 dark:border-slate-700">
                                  <span className="min-w-0">
                                    <span className="block truncate font-sans font-medium text-slate-900 dark:text-white">
                                      {assignment.guestName || assignment.guestEmail || 'Guest'} · Scheduled
                                    </span>
                                    <span className="text-[10px] text-slate-500">Effective {effectiveDate.toLocaleDateString()}</span>
                                    <span className="mt-1 block text-[10px] text-slate-600 dark:text-slate-300">
                                      Actual rate: {getAssignmentRateLabel(assignment, room, property.currency)}
                                    </span>
                                  </span>
                                  {canDeskCheckIn && (
                                    <button
                                      type="button"
                                      disabled={!isEffective}
                                      title={isEffective ? 'Complete room change' : 'Effective next month'}
                                      aria-label={isEffective ? 'Complete room change' : 'Room change pending'}
                                      onClick={() => {
                                        const deposit = property.feeConfigs.find(
                                          (fee) => fee.feeType === 'SECURITY_DEPOSIT' && fee.isActive,
                                        );
                                        setDeskDepositAmount(String(deposit?.amount ?? '0'));
                                        setScheduledCheckInAssignment(assignment);
                                      }}
                                      className="shrink-0 border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                                    >
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </details>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-700 dark:text-slate-300">
                      {filledBeds}/{totalBeds}
                    </td>
                    {user?.role === 'ADMIN' && (
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => editRoom(room, floor.floorNumber)}
                            aria-label={`Edit ${room.type.toLowerCase()} ${room.unitNumber}`}
                            title="Edit room"
                            className="border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setUnitToDelete(room)}
                            aria-label={`Delete ${room.type.toLowerCase()} ${room.unitNumber}`}
                            title="Delete room"
                            className="border border-slate-300 p-1.5 text-slate-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700 dark:border-slate-600 dark:text-slate-300 dark:hover:border-red-800 dark:hover:bg-red-950/30 dark:hover:text-red-300"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                </tr>
              );
            })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </section>}

      {deskOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={createDeskAssignment} className="w-full max-w-lg space-y-4 bg-white p-5 dark:bg-slate-800">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold">Desk walk-in check-in</h2>
                <p className="text-xs text-slate-500">The agreed rate is stored only on this assignment.</p>
              </div>
              <button type="button" onClick={() => setDeskOpen(false)} aria-label="Close walk-in dialog"><X className="h-5 w-5" /></button>
            </div>
            <label className="block space-y-1 text-xs font-semibold">
              Active customer
              <select required value={deskUserId} onChange={(event) => setDeskUserId(event.target.value)} className={inputClass} disabled={deskOptionsLoading}>
                <option value="">{deskOptionsLoading ? 'Loading active customers…' : 'Select active customer'}</option>
                {deskCustomers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.full_name || customer.email || customer.id}{customer.email && customer.full_name ? ` · ${customer.email}` : ''}
                  </option>
                ))}
              </select>
              {deskOptionsError && <span role="alert" className="block text-rose-700">{deskOptionsError}</span>}
              {!deskOptionsLoading && !deskOptionsError && deskCustomers.length === 0 && (
                <span className="block text-slate-500">No unassigned active customers are available.</span>
              )}
            </label>
            <label className="block space-y-1 text-xs font-semibold">
              Available {isHostel ? 'bed' : 'room'}
              <select required value={deskUnitId} onChange={(event) => {
                setDeskUnitId(event.target.value);
                setDeskRateOverrideReason('');
              }} className={inputClass}>
                <option value="">Select unit</option>
                {availableDeskUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.unitNumber} · {unit.sharingType || unit.category} · {unit.status}</option>)}
              </select>
            </label>
            <label className="block space-y-1 text-xs font-semibold">
              Check-in date
              <input required type="date" value={deskCheckIn} onChange={(event) => setDeskCheckIn(event.target.value)} className={inputClass} />
            </label>
            <label className="block space-y-1 text-xs font-semibold">
              Agreed rate override ({property.currency}/{isHostel ? 'month' : 'night'}, optional)
              <input type="number" min="0.01" step="0.01" value={deskRate} onChange={(event) => setDeskRate(event.target.value)} className={inputClass} />
            </label>
            <label className="block space-y-1 text-xs font-semibold">
              Rate override reason {deskHasRateOverride ? '*' : '(required if different from standard)'}
              <input required={deskHasRateOverride} maxLength={2000} value={deskRateOverrideReason} onChange={(event) => setDeskRateOverrideReason(event.target.value)} className={inputClass} />
            </label>
            {property.feeConfigs.some((fee) => fee.feeType === 'SECURITY_DEPOSIT' && fee.isActive) ? (
              <>
                <label className="block space-y-1 text-xs font-semibold">
                  Security deposit collected upfront ({property.currency})
                  <input required type="number" min="0.01" step="0.01" value={deskDepositAmount} onChange={(event) => setDeskDepositAmount(event.target.value)} className={inputClass} />
                </label>
                <label className="block space-y-1 text-xs font-semibold">
                  Deposit payment method
                  <select value={deskDepositMethod} onChange={(event) => setDeskDepositMethod(event.target.value)} className={inputClass}>
                    <option value="CASH">Cash</option><option value="UPI">UPI</option><option value="CARD">Card</option><option value="BANK_TRANSFER">Bank transfer</option>
                  </select>
                </label>
              </>
            ) : <p className="text-xs text-slate-500">No security deposit is configured for this property.</p>}
            <button type="submit" disabled={deskSaving || deskOptionsLoading || deskOptionsError !== '' || deskCustomers.length === 0 || availableDeskUnits.length === 0 || (deskHasRateOverride && !deskRateOverrideReason.trim())} className="w-full bg-blue-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-60">
              Assign walk-in
            </button>
          </form>
        </div>
      )}
      {roomChangeAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={scheduleRoomChange} className="w-full max-w-lg space-y-4 bg-white p-5 dark:bg-slate-800">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold">Change or deassign room</h2>
                <p className="mt-1 text-xs text-slate-500">
                  This takes effect next month. The current month&apos;s fees remain unchanged.
                </p>
              </div>
              <button type="button" onClick={() => setRoomChangeAssignment(null)} aria-label="Close room change dialog">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm">
              {roomChangeAssignment.guestName || roomChangeAssignment.guestEmail || 'Customer'} · {roomChangeAssignment.unitNumber}
            </p>
            <label className="block space-y-1 text-xs font-semibold">
              New available {isHostel ? 'bed' : 'room'} (leave empty to deassign)
              <select value={roomChangeUnitId} onChange={(event) => setRoomChangeUnitId(event.target.value)} className={inputClass}>
                <option value="">Deassign at month end</option>
                {availableDeskUnits
                  .filter((unit) => unit.id !== roomChangeAssignment.unitId)
                  .map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.unitNumber} · {unit.sharingType || unit.category} · {unit.status}
                    </option>
                  ))}
              </select>
            </label>
            <p className="text-xs text-slate-500">
              A selected room is reserved now. Its {isHostel ? 'monthly' : 'nightly'} rate begins next month; complete the move/check-in then.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" disabled={roomChangeSaving} onClick={() => setRoomChangeAssignment(null)} className="border border-slate-300 px-3 py-2 text-xs font-bold uppercase dark:border-slate-600">
                Cancel
              </button>
              <button type="submit" disabled={roomChangeSaving} className="bg-blue-700 px-3 py-2 text-xs font-bold uppercase text-white disabled:opacity-60">
                {roomChangeSaving ? 'Scheduling…' : roomChangeUnitId ? 'Schedule room change' : 'Schedule deassignment'}
              </button>
            </div>
          </form>
        </div>
      )}
      {scheduledCheckInAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={checkInScheduledRoomChange} className="w-full max-w-lg space-y-4 bg-white p-5 dark:bg-slate-800">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold">Complete room change</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Check out the current room and settle its folio first. The new room&apos;s rate starts now. The existing security deposit obligation, including any unpaid balance, transfers with the customer and is not charged again.
                </p>
              </div>
              <button type="button" onClick={() => setScheduledCheckInAssignment(null)} aria-label="Close room change check-in dialog">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm">
              {scheduledCheckInAssignment.guestName || scheduledCheckInAssignment.guestEmail || 'Customer'} · {scheduledCheckInAssignment.unitNumber}
            </p>
            {property.feeConfigs.some((fee) => fee.feeType === 'SECURITY_DEPOSIT' && fee.isActive) ? (
              <>
                <label className="block space-y-1 text-xs font-semibold">
                  Security deposit collected if no existing obligation transfers ({property.currency})
                  <input required type="number" min="0.01" step="0.01" value={deskDepositAmount} onChange={(event) => setDeskDepositAmount(event.target.value)} className={inputClass} />
                </label>
                <label className="block space-y-1 text-xs font-semibold">
                  Deposit payment method
                  <select value={deskDepositMethod} onChange={(event) => setDeskDepositMethod(event.target.value)} className={inputClass}>
                    <option value="CASH">Cash</option><option value="UPI">UPI</option><option value="CARD">Card</option><option value="BANK_TRANSFER">Bank transfer</option>
                  </select>
                </label>
              </>
            ) : <p className="text-xs text-slate-500">No security deposit is configured for this property.</p>}
            <div className="flex justify-end gap-2">
              <button type="button" disabled={scheduledCheckInSaving} onClick={() => setScheduledCheckInAssignment(null)} className="border border-slate-300 px-3 py-2 text-xs font-bold uppercase dark:border-slate-600">
                Cancel
              </button>
              <button type="submit" disabled={scheduledCheckInSaving} className="bg-blue-700 px-3 py-2 text-xs font-bold uppercase text-white disabled:opacity-60">
                {scheduledCheckInSaving ? 'Completing…' : 'Complete room change'}
              </button>
            </div>
          </form>
        </div>
      )}
      {unitToDelete && (
        <ConfirmDialog
          title="Delete room from inventory?"
          description={`${unitToDelete.unitNumber} will be removed from active inventory. Historical assignment and fee records are retained; rooms with current or future assignments cannot be deleted.`}
          confirmLabel="Delete room"
          isConfirming={deletingUnit}
          onConfirm={() => { void deleteRoom(); }}
          onCancel={() => setUnitToDelete(null)}
        />
      )}
    </div>
  );
};
