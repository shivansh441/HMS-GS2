import { CustomerPersona } from '../../types';
import { ManagedUser, UserForm } from './userTypes';

export const localDateToday = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export const emptyAdditionalGuestForm = () => ({
  fullName: '',
  dateOfBirth: '',
  gender: '',
  email: '',
  phone: '',
  addressCountry: '',
  addressCity: '',
  addressState: '',
  addressPincode: '',
  addressLine: '',
  sameAddressAsMainOccupant: false,
  idDocumentType: '',
  idDocumentNumber: '',
});

export const addressPartsFromString = (address: string | null | undefined) => {
  const parsed = {
    addressCountry: '',
    addressCity: '',
    addressState: '',
    addressPincode: '',
    addressLine: '',
  };
  const keys = {
    Address: 'addressLine',
    City: 'addressCity',
    State: 'addressState',
    Pincode: 'addressPincode',
    Country: 'addressCountry',
  } as const;
  let hasStructuredAddress = false;

  for (const part of (address || '').split(/,\s*(?=(?:Address|City|State|Pincode|Country):)/)) {
    const separator = part.indexOf(':');
    const label = separator === -1 ? '' : part.slice(0, separator);
    const key = Object.keys(keys).find(
      (candidate): candidate is keyof typeof keys => candidate === label,
    );
    if (key) {
      parsed[keys[key]] = part.slice(separator + 1).trim();
      hasStructuredAddress = true;
    }
  }
  return hasStructuredAddress ? parsed : { ...parsed, addressLine: address || '' };
};

export const addressStringFromParts = ({
  addressCountry,
  addressCity,
  addressState,
  addressPincode,
  addressLine,
}: {
  addressCountry: string;
  addressCity: string;
  addressState: string;
  addressPincode: string;
  addressLine: string;
}) =>
  [
    ['Address', addressLine],
    ['City', addressCity],
    ['State', addressState],
    ['Pincode', addressPincode],
    ['Country', addressCountry],
  ]
    .map(([label, part]) => [label, part.trim()] as const)
    .filter(([, part]) => Boolean(part))
    .map(([label, part]) => `${label}: ${part}`)
    .join(', ');

export const emptyUserForm: UserForm = {
  email: '',
  fullName: '',
  phone: '',
  gender: '',
  dateOfBirth: '',
  idDocumentType: '',
  idDocumentNumber: '',
  role: 'CUSTOMER',
  staffRole: 'FRONT_DESK',
  propertyIds: [],
  customerPersona: 'HOTEL_GUEST',
  emergencyContactPhone: '',
  addressCountry: '',
  addressCity: '',
  addressState: '',
  addressPincode: '',
  addressLine: '',
  occupation: '',
  initialStayPropertyId: '',
  stayStartDate: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10),
  stayEndDate: '',
  guestCount: 1,
  additionalGuests: [],
};

export const formFromUser = (user: ManagedUser): UserForm => ({
  email: user.email || '',
  fullName: user.full_name || '',
  phone: user.phone || '',
  gender: user.gender || '',
  dateOfBirth: user.date_of_birth || '',
  idDocumentType: user.idDocumentType || '',
  idDocumentNumber: '',
  role: user.role,
  staffRole: user.staffRole || 'FRONT_DESK',
  propertyIds: user.propertyIds || [],
  customerPersona: user.customerPersona || '',
  emergencyContactPhone: user.emergencyContactPhone || '',
  ...addressPartsFromString(user.permanentAddress),
  occupation: user.occupation || '',
  initialStayPropertyId: user.initialStay?.propertyId || '',
  stayStartDate: user.initialStay?.startDate || '',
  stayEndDate: user.initialStay?.endDate || '',
  guestCount: user.initialStay?.guestCount || 1,
  additionalGuests: user.initialStay?.additionalGuests.map((guest) => ({
    id: guest.id,
    idDocumentLast4: guest.idDocumentLast4,
    fullName: guest.fullName,
    dateOfBirth: guest.dateOfBirth || '',
    gender: guest.gender || '',
    email: guest.email || '',
    phone: guest.phone || '',
    ...addressPartsFromString(guest.permanentAddress),
    sameAddressAsMainOccupant: false,
    idDocumentType: guest.idDocumentType,
    idDocumentNumber: '',
  })) || [],
});

export const isPropertyCompatibleWithGuest = (
  propertyType: string,
  persona: CustomerPersona | '',
) => {
  if (persona === 'HOTEL_GUEST') return propertyType === 'HOTEL';
  if (persona === 'HOSTEL_GUEST' || persona === 'HOSTELER') {
    return ['HOSTEL_BOYS', 'HOSTEL_GIRLS', 'HOSTEL_COED', 'CO_LIVING'].includes(propertyType);
  }
  return true;
};

export const guestPersonaForProperty = (propertyType: string): CustomerPersona =>
  propertyType === 'HOTEL' ? 'HOTEL_GUEST' : 'HOSTELER';
