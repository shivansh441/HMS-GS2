import { CustomerPersona, User } from '../../types';

export type UserEditorMode = 'create' | 'view' | 'edit' | null;

export interface ManagedUser extends User {
  propertyIds: string[];
  activationUrl?: string | null;
  idDocumentType: string | null;
  idDocumentLast4: string | null;
  emergencyContactPhone: string | null;
  permanentAddress: string | null;
  occupation: string | null;
  initialStay: {
    propertyId: string;
    startDate: string;
    endDate: string | null;
    guestCount: number;
    additionalGuests: Array<{
      id: string;
      fullName: string;
      dateOfBirth: string | null;
      gender: string | null;
      email: string | null;
      phone: string | null;
      permanentAddress: string | null;
      idDocumentType: string;
      idDocumentLast4: string;
    }>;
  } | null;
}

export interface AdditionalGuestForm {
  id?: string;
  idDocumentLast4?: string;
  fullName: string;
  dateOfBirth: string;
  gender: string;
  email: string;
  phone: string;
  addressCountry: string;
  addressCity: string;
  addressState: string;
  addressPincode: string;
  addressLine: string;
  sameAddressAsMainOccupant: boolean;
  idDocumentType: string;
  idDocumentNumber: string;
}

export interface UserForm {
  email: string;
  fullName: string;
  phone: string;
  gender: string;
  dateOfBirth: string;
  idDocumentType: string;
  idDocumentNumber: string;
  role: 'ADMIN' | 'STAFF' | 'CUSTOMER';
  staffRole: 'FRONT_DESK' | 'MAINTENANCE' | 'HOUSEKEEPING';
  propertyIds: string[];
  customerPersona: CustomerPersona | '';
  emergencyContactPhone: string;
  addressCountry: string;
  addressCity: string;
  addressState: string;
  addressPincode: string;
  addressLine: string;
  occupation: string;
  initialStayPropertyId: string;
  stayStartDate: string;
  stayEndDate: string;
  guestCount: number;
  additionalGuests: AdditionalGuestForm[];
}
