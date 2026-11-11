import React from 'react';
import { Pencil, Save } from 'lucide-react';
import { AddressFields } from './AddressFields';
import { AdditionalOccupants } from './AdditionalOccupants';
import { LoadingIndicator } from '../../components/ui/LoadingIndicator';
import { CustomerPersona, Property } from '../../types';
import { addressPartsFromString, emptyAdditionalGuestForm, guestPersonaForProperty, isPropertyCompatibleWithGuest, localDateToday } from './userForm';
import { userInputClass, userLabelClass, userSectionClass } from './userStyles';
import { ManagedUser, UserEditorMode, UserForm } from './userTypes';

interface UserEditorProps {
  editorMode: Exclude<UserEditorMode, null>;
  selectedUser: ManagedUser | null;
  userForm: UserForm;
  setUserForm: React.Dispatch<React.SetStateAction<UserForm>>;
  editorLoading: boolean;
  editorSaving: boolean;
  editorError: string | null;
  activationUrl: string | null;
  isAdmin: boolean;
  selectedPropertyId: string | null;
  properties: Property[];
  guestProperties: Property[];
  closeEditor: () => void;
  saveUser: (event: React.FormEvent<HTMLFormElement>) => void;
  toggleProperty: (propertyId: string) => void;
  setEditorMode: React.Dispatch<React.SetStateAction<UserEditorMode>>;
}

export const UserEditor: React.FC<UserEditorProps> = ({
  editorMode,
  selectedUser,
  userForm,
  setUserForm,
  editorLoading,
  editorSaving,
  editorError,
  activationUrl,
  isAdmin,
  selectedPropertyId,
  properties,
  guestProperties,
  closeEditor,
  saveUser,
  toggleProperty,
  setEditorMode,
}) => (
  <>
    <section aria-labelledby="user-editor-title" className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h2 id="user-editor-title" className="text-xl font-semibold text-slate-900 dark:text-white">
                  {editorMode === 'create'
                    ? 'Create account'
                    : editorMode === 'edit'
                      ? 'Edit account'
                      : 'User details'}
                </h2>
                {selectedUser && (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    ID: {selectedUser.id} · {selectedUser.status.replaceAll('_', ' ')}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={closeEditor}
                className="text-sm font-medium text-blue-700 hover:underline dark:text-blue-300"
              >
                Back to directory
              </button>
            </div>

            {editorError && (
              <div role="alert" className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
                {editorError}
              </div>
            )}
            {editorLoading ? (
              <LoadingIndicator label="Loading user details..." />
            ) : (
              <form onSubmit={saveUser} className="flex w-full flex-col gap-4 font-mono">
                <fieldset className={`${userSectionClass} md:col-span-2 lg:col-span-3`}>
                  <legend className="col-span-full mb-1 text-base font-semibold text-slate-900 dark:text-white">Account information</legend>
                <label className={userLabelClass}>
                  <span>Full name <span className="text-red-600" aria-hidden="true">*</span></span>
                  <input
                    required
                    maxLength={128}
                    disabled={editorMode === 'view' || editorSaving}
                    className={userInputClass}
                    value={editorMode === 'view' ? selectedUser?.full_name || '' : userForm.fullName}
                    onChange={(event) => setUserForm((form) => ({ ...form, fullName: event.target.value }))}
                  />
                </label>
                <label className={userLabelClass}>
                  <span>Email <span className="text-red-600" aria-hidden="true">*</span></span>
                  <input
                    required
                    type="email"
                    maxLength={255}
                    disabled={editorMode === 'view' || editorSaving}
                    className={userInputClass}
                    value={editorMode === 'view' ? selectedUser?.email || '' : userForm.email}
                    onChange={(event) => setUserForm((form) => ({ ...form, email: event.target.value }))}
                  />
                </label>
                <label className={userLabelClass}>
                  <span>Phone <span className="text-red-600" aria-hidden="true">*</span></span>
                  <input
                    required
                    type="tel"
                    minLength={5}
                    maxLength={32}
                    disabled={editorMode === 'view' || editorSaving}
                    className={userInputClass}
                    value={editorMode === 'view' ? selectedUser?.phone || '' : userForm.phone}
                    onChange={(event) => setUserForm((form) => ({ ...form, phone: event.target.value }))}
                  />
                </label>
                <label className={userLabelClass}>
                  <span>Date of birth <span className="text-red-600" aria-hidden="true">*</span></span>
                  <input
                    required
                    type="date"
                    max={localDateToday()}
                    disabled={editorMode === 'view' || editorSaving}
                    className={userInputClass}
                    value={editorMode === 'view' ? selectedUser?.date_of_birth || '' : userForm.dateOfBirth}
                    onChange={(event) => setUserForm((form) => ({ ...form, dateOfBirth: event.target.value }))}
                  />
                </label>
                <label className={userLabelClass}>
                  Gender
                  <select
                    disabled={editorMode === 'view' || editorSaving}
                    className={userInputClass}
                    value={editorMode === 'view' ? selectedUser?.gender || '' : userForm.gender}
                    onChange={(event) => setUserForm((form) => ({ ...form, gender: event.target.value }))}
                  >
                    <option value="">Not provided</option>
                    <option value="FEMALE">Female</option>
                    <option value="MALE">Male</option>
                    <option value="NON_BINARY">Non-binary</option>
                    <option value="OTHER">Other</option>
                  </select>
                </label>
                {userForm.role === 'CUSTOMER' && (
                  <label className={userLabelClass}>
                    Emergency contact number
                    <input
                      type="tel"
                      maxLength={32}
                      disabled={editorMode === 'view' || editorSaving}
                      className={userInputClass}
                      value={userForm.emergencyContactPhone}
                      onChange={(event) => setUserForm((form) => ({ ...form, emergencyContactPhone: event.target.value }))}
                    />
                  </label>
                )}
                <div className="flex min-w-0 flex-col gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200 lg:col-span-3">
                  <span>Government ID <span className="text-red-600" aria-hidden="true">*</span></span>
                  {selectedUser?.idDocumentLast4 && (
                    <p className="font-normal text-slate-500">
                      Current: {selectedUser.idDocumentType || 'ID'} ending in {selectedUser.idDocumentLast4}
                    </p>
                  )}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <select
                      disabled={editorMode === 'view' || editorSaving}
                      required={
                        editorMode === 'create' ||
                        (!selectedUser?.idDocumentLast4 && editorMode === 'edit')
                      }
                      className={userInputClass}
                      value={editorMode === 'view' ? selectedUser?.idDocumentType || '' : userForm.idDocumentType}
                      onChange={(event) => setUserForm((form) => ({ ...form, idDocumentType: event.target.value }))}
                    >
                      <option value="">Document type</option>
                      <option value="AADHAAR">Aadhaar</option>
                      <option value="PAN">PAN</option>
                      <option value="VOTER_ID">Voter ID</option>
                      <option value="PASSPORT">Passport</option>
                      <option value="DRIVING_LICENSE">Driving licence</option>
                      <option value="OTHER_GOVERNMENT_ID">Other government ID</option>
                      <option value="NATIONAL_ID">National ID (legacy)</option>
                      <option value="DRIVERS_LICENSE">Driver's license (legacy)</option>
                      <option value="OTHER">Other (legacy)</option>
                    </select>
                    <input
                      type="password"
                      autoComplete="new-password"
                      maxLength={128}
                      disabled={editorMode === 'view' || editorSaving}
                      required={
                        editorMode === 'create' ||
                        (!selectedUser?.idDocumentLast4 && editorMode === 'edit')
                      }
                      className={userInputClass}
                      placeholder={selectedUser?.idDocumentLast4 ? 'Enter to replace ID' : 'ID number'}
                      value={userForm.idDocumentNumber}
                      onChange={(event) => setUserForm((form) => ({ ...form, idDocumentNumber: event.target.value }))}
                    />
                  </div>
                </div>
                <div className="min-w-0 md:col-span-2 lg:col-span-3">
                  <AddressFields
                    value={editorMode === 'view'
                      ? addressPartsFromString(selectedUser?.permanentAddress)
                      : userForm}
                    disabled={editorMode === 'view' || editorSaving}
                    onChange={(address) => setUserForm((form) => ({
                      ...form,
                      ...address,
                      additionalGuests: form.additionalGuests.map((guest) =>
                        guest.sameAddressAsMainOccupant
                          ? { ...guest, ...address }
                          : guest,
                      ),
                    }))}
                  />
                </div>
                </fieldset>

                {(userForm.role === 'CUSTOMER' || editorMode === 'create') && (
                  <fieldset className={`order-first grid min-w-0 grid-cols-1 gap-4 border-b border-slate-200 bg-transparent px-0 pb-5 dark:border-slate-700 md:col-span-2 md:grid-cols-2 ${userForm.customerPersona === 'HOSTEL_GUEST' ? 'lg:grid-cols-2' : 'lg:grid-cols-3'}`}>
                    <legend className="col-span-full mb-1 text-base font-semibold text-slate-900 dark:text-white">
                      {userForm.role === 'CUSTOMER' ? 'Customer information' : 'Account role'}
                    </legend>
                    {userForm.role === 'CUSTOMER' && (
                      <label className={userLabelClass}>
                        <span>Property <span className="text-red-600" aria-hidden="true">*</span></span>
                        <select
                          required
                          disabled={editorMode === 'view' || editorSaving}
                          className={userInputClass}
                          value={userForm.initialStayPropertyId}
                          onChange={(event) =>
                            setUserForm((form) => ({ ...form, initialStayPropertyId: event.target.value }))
                          }
                        >
                          <option value="">Select property</option>
                          {guestProperties.map((property) => (
                            <option key={property.id} value={property.id}>{property.code} · {property.name}</option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label className={userLabelClass}>
                      <span>Account role <span className="text-red-600" aria-hidden="true">*</span></span>
                      <select
                        disabled={editorMode !== 'create' || editorSaving}
                        className={userInputClass}
                        value={userForm.role}
                        onChange={(event) => {
                          const role = event.target.value as UserForm['role'];
                          const scopedPropertyId =
                            selectedPropertyId && selectedPropertyId !== 'ALL' && properties.some((property) => property.id === selectedPropertyId)
                              ? selectedPropertyId
                              : '';
                          const scopedProperty = properties.find((property) => property.id === scopedPropertyId);
                          const customerPersona = scopedProperty
                            ? guestPersonaForProperty(scopedProperty.type)
                            : 'HOTEL_GUEST';
                          const guestPropertyId = scopedProperty
                            && isPropertyCompatibleWithGuest(scopedProperty.type, customerPersona)
                            ? scopedPropertyId
                            : '';
                          setUserForm((form) => ({
                            ...form,
                            role,
                            customerPersona: role === 'CUSTOMER' ? customerPersona : '',
                            propertyIds: role === 'ADMIN'
                              ? []
                              : role === 'CUSTOMER'
                                ? (guestPropertyId ? [guestPropertyId] : [])
                                : (scopedPropertyId ? [scopedPropertyId] : []),
                            emergencyContactPhone: '',
                            permanentAddress: '',
                            occupation: '',
                            initialStayPropertyId: role === 'CUSTOMER' ? guestPropertyId : '',
                            stayStartDate: role === 'CUSTOMER' ? form.stayStartDate : '',
                            stayEndDate: '',
                            guestCount: 1,
                            additionalGuests: [],
                          }));
                        }}
                      >
                        <option value="ADMIN">Admin</option>
                        <option value="STAFF">Staff</option>
                        <option value="CUSTOMER">Customer</option>
                      </select>
                      {editorMode === 'create' && userForm.role === 'STAFF' && (
                        <span className="block font-normal text-slate-500">
                          Staff need a role and at least one property assignment.
                        </span>
                      )}
                    </label>
                    {userForm.role === 'CUSTOMER' && (
                    <>
                    <label className={userLabelClass}>
                      <span>Guest subtype <span className="text-red-600" aria-hidden="true">*</span></span>
                      <select
                        required
                        disabled={editorMode === 'view' || editorSaving}
                        className={userInputClass}
                        value={userForm.customerPersona}
                        onChange={(event) =>
                          setUserForm((form) => {
                            const customerPersona = event.target.value as CustomerPersona;
                            const selectedProperty = properties.find(
                              (property) => property.id === form.initialStayPropertyId,
                            );
                            const keepSelectedProperty = selectedProperty
                              && isPropertyCompatibleWithGuest(selectedProperty.type, customerPersona);
                            return {
                              ...form,
                              customerPersona,
                              guestCount: 1,
                              additionalGuests: [],
                              initialStayPropertyId: keepSelectedProperty ? form.initialStayPropertyId : '',
                              propertyIds: keepSelectedProperty ? [form.initialStayPropertyId] : [],
                            };
                          })
                        }
                      >
                        <option value="">Select guest subtype</option>
                        <option value="HOTEL_GUEST">Hotel guest</option>
                        <option value="HOSTEL_GUEST">Hostel guest</option>
                        <option value="HOSTELER">Hosteler</option>
                      </select>
                    </label>
                    {userForm.customerPersona === 'HOSTELER' && (
                      <>
                        <label className={userLabelClass}>
                          Occupation
                          <input
                            maxLength={128}
                            disabled={editorMode === 'view' || editorSaving}
                            className={userInputClass}
                            value={userForm.occupation}
                            onChange={(event) => setUserForm((form) => ({ ...form, occupation: event.target.value }))}
                          />
                        </label>
                      </>
                    )}
                    <fieldset className={`grid min-w-0 grid-cols-1 gap-4 border-t border-slate-200 bg-transparent px-0 pt-4 dark:border-slate-700 md:col-span-2 md:grid-cols-2 lg:col-span-full ${userForm.customerPersona === 'HOSTEL_GUEST' ? 'lg:grid-cols-2' : 'lg:grid-cols-3'}`}>
                      <legend className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-100">Initial stay <span className="text-red-600" aria-hidden="true">*</span></legend>
                      {userForm.customerPersona === 'HOTEL_GUEST' && (
                        <label className={userLabelClass}>
                          Total number of occupants
                          <input
                            required
                            type="number"
                            min={1}
                            max={100}
                            disabled={editorMode === 'view' || editorSaving}
                            className={userInputClass}
                            value={userForm.guestCount}
                            onChange={(event) => {
                              const guestCount = Math.max(1, Math.min(100, Number(event.target.value) || 1));
                              setUserForm((form) => ({
                                ...form,
                                guestCount,
                                additionalGuests: [
                                  ...form.additionalGuests.slice(0, guestCount - 1),
                                  ...Array.from(
                                    { length: Math.max(0, guestCount - 1 - form.additionalGuests.length) },
                                    emptyAdditionalGuestForm,
                                  ),
                                ],
                              }));
                            }}
                          />
                        </label>
                      )}
                      <label className={userLabelClass}>
                        <span>Start date <span className="text-red-600" aria-hidden="true">*</span></span>
                        <input
                          required
                          type="date"
                          disabled={editorMode === 'view' || editorSaving}
                          className={userInputClass}
                          value={userForm.stayStartDate}
                          onChange={(event) => setUserForm((form) => ({ ...form, stayStartDate: event.target.value }))}
                        />
                      </label>
                      <label className={userLabelClass}>
                        Expected end date
                        <input
                          type="date"
                          min={userForm.stayStartDate || undefined}
                          disabled={editorMode === 'view' || editorSaving}
                          className={userInputClass}
                          value={userForm.stayEndDate}
                          onChange={(event) => setUserForm((form) => ({ ...form, stayEndDate: event.target.value }))}
                        />
                      </label>
                    </fieldset>
                    </>
                    )}
                  </fieldset>
                )}

                {userForm.role === 'CUSTOMER' && (
                  <div className="md:col-span-2 lg:col-span-full">
                    <AdditionalOccupants
                      editorMode={editorMode}
                      userForm={userForm}
                      setUserForm={setUserForm}
                      editorSaving={editorSaving}
                    />
                  </div>
                )}

                {userForm.role === 'STAFF' && (
                  <label className={userLabelClass}>
                    <span>Staff role <span className="text-red-600" aria-hidden="true">*</span></span>
                    <select
                      disabled={editorMode === 'view' || editorSaving}
                      className={userInputClass}
                      value={userForm.staffRole}
                      onChange={(event) =>
                        setUserForm((form) => ({
                          ...form,
                          staffRole: event.target.value as UserForm['staffRole'],
                        }))
                      }
                    >
                      <option value="FRONT_DESK">Front desk</option>
                      <option value="MAINTENANCE">Maintenance</option>
                      <option value="HOUSEKEEPING">Housekeeping</option>
                    </select>
                  </label>
                )}

                {userForm.role === 'ADMIN' ? (
                  <div className="text-sm text-slate-600 dark:text-slate-400">
                    Admin accounts automatically have access to all properties.
                  </div>
                ) : userForm.role === 'STAFF' ? (
                  <fieldset className={`${userSectionClass} md:col-span-2 lg:col-span-3`}>
                    <legend className="col-span-full mb-1 text-base font-semibold text-slate-900 dark:text-white">
                      Staff property assignments <span className="text-red-600" aria-hidden="true">*</span>
                    </legend>
                    {properties.length === 0 ? (
                      <p className="text-xs text-slate-500">No properties are available to assign.</p>
                    ) : (
                      <div className="grid grid-cols-1 gap-2 sm:col-span-2 sm:grid-cols-2 lg:col-span-3">
                        {properties.map((property) => (
                          <label
                            key={property.id}
                            className="flex items-center gap-2 border-b border-slate-200 py-2 text-sm dark:border-slate-700"
                          >
                            <input
                              type="checkbox"
                              disabled={editorMode === 'view' || editorSaving}
                              checked={userForm.propertyIds.includes(property.id)}
                              onChange={() => toggleProperty(property.id)}
                            />
                            <span>[{property.code}] {property.name}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </fieldset>
                ) : null}

                {activationUrl && (
                  <div className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-700">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                      One-time account setup link. Share it securely; do not post it publicly.
                    </p>
                    <input
                      readOnly
                      aria-label="One-time account setup link"
                      className={userInputClass}
                      value={activationUrl}
                      onFocus={(event) => event.currentTarget.select()}
                    />
                  </div>
                )}

                <div className="flex flex-wrap justify-end gap-3 pt-1">
                  <button
                    type="button"
                    onClick={closeEditor}
                    className="h-10 rounded-md border border-slate-300 px-4 text-sm font-medium dark:border-slate-600"
                  >
                    Close
                  </button>
                  {editorMode === 'view' && isAdmin && (
                    <button
                      type="button"
                      onClick={() => setEditorMode('edit')}
                      className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-800 px-4 text-sm font-medium text-white hover:bg-slate-700"
                    >
                      <Pencil className="h-4 w-4" />
                      Edit
                    </button>
                  )}
                  {editorMode !== 'view' && isAdmin && (
                    <button
                      type="submit"
                      disabled={editorSaving}
                      className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-700 px-4 text-sm font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Save className="h-4 w-4" />
                      {editorSaving ? 'Saving…' : editorMode === 'create' ? 'Create account' : 'Save changes'}
                    </button>
                  )}
                </div>
              </form>
            )}
          </section>
  </>
);
