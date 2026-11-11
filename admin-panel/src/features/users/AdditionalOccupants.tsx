import React from 'react';
import { AddressFields } from './AddressFields';
import { UserEditorMode, UserForm } from './userTypes';
import { addressStringFromParts, localDateToday } from './userForm';
import { userInputClass, userLabelClass } from './userStyles';

interface AdditionalOccupantsProps {
  editorMode: Exclude<UserEditorMode, null>;
  userForm: UserForm;
  setUserForm: React.Dispatch<React.SetStateAction<UserForm>>;
  editorSaving: boolean;
}

export const AdditionalOccupants: React.FC<AdditionalOccupantsProps> = ({
  editorMode,
  userForm,
  setUserForm,
  editorSaving,
}) => (
  <>
    {userForm.customerPersona === 'HOTEL_GUEST' &&
                      editorMode !== 'view' &&
                      userForm.additionalGuests.length > 0 && (
                      <fieldset className="grid min-w-0 gap-4 border-t border-slate-200 bg-transparent pt-4 dark:border-slate-700 md:col-span-2 md:grid-cols-2 lg:grid-cols-3">
                        <legend className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-100">Additional occupants</legend>
                        <div className="space-y-4 md:col-span-2 lg:col-span-3">
                          {userForm.additionalGuests.map((guest, index) => (
                            <fieldset key={index} className="grid min-w-0 gap-3 border-t border-slate-200 bg-transparent px-0 pt-3 dark:border-slate-700 sm:grid-cols-2 lg:grid-cols-6">
                                <legend className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-200">Additional occupant {index + 1}</legend>
                              <label className={`${userLabelClass} sm:col-span-2 lg:col-span-2`}>
                                <span>Full name <span className="text-red-600" aria-hidden="true">*</span></span>
                                <input
                                  required
                                  maxLength={128}
                                  disabled={editorSaving}
                                  className={userInputClass}
                                  value={guest.fullName}
                                  onChange={(event) => setUserForm((form) => ({
                                    ...form,
                                    additionalGuests: form.additionalGuests.map((item, itemIndex) =>
                                      itemIndex === index ? { ...item, fullName: event.target.value } : item,
                                    ),
                                  }))}
                                />
                              </label>
                              <label className={`${userLabelClass} lg:col-span-2`}>
                                <span>
                                  Date of birth {!guest.id && <span className="text-red-600" aria-hidden="true">*</span>}
                                </span>
                                <input
                                  required={!guest.id}
                                  type="date"
                                  max={localDateToday()}
                                  disabled={editorSaving}
                                  className={userInputClass}
                                  value={guest.dateOfBirth}
                                  onChange={(event) => setUserForm((form) => ({
                                    ...form,
                                    additionalGuests: form.additionalGuests.map((item, itemIndex) =>
                                      itemIndex === index ? { ...item, dateOfBirth: event.target.value } : item,
                                    ),
                                  }))}
                                />
                              </label>
                              <label className={`${userLabelClass} lg:col-span-2`}>
                                Gender
                                <select
                                  disabled={editorSaving}
                                  className={userInputClass}
                                  value={guest.gender}
                                  onChange={(event) => setUserForm((form) => ({
                                    ...form,
                                    additionalGuests: form.additionalGuests.map((item, itemIndex) =>
                                      itemIndex === index ? { ...item, gender: event.target.value } : item,
                                    ),
                                  }))}
                                >
                                  <option value="">Not provided</option>
                                  <option value="FEMALE">Female</option>
                                  <option value="MALE">Male</option>
                                  <option value="NON_BINARY">Non-binary</option>
                                  <option value="OTHER">Other</option>
                                </select>
                              </label>
                              <label className={`${userLabelClass} lg:col-span-3`}>
                                Email
                                <input
                                  type="email"
                                  disabled={editorSaving}
                                  className={userInputClass}
                                  value={guest.email}
                                  onChange={(event) => setUserForm((form) => ({
                                    ...form,
                                    additionalGuests: form.additionalGuests.map((item, itemIndex) =>
                                      itemIndex === index ? { ...item, email: event.target.value } : item,
                                    ),
                                  }))}
                                />
                              </label>
                              <label className={`${userLabelClass} lg:col-span-3`}>
                                Phone
                                <input
                                  type="tel"
                                  maxLength={32}
                                  disabled={editorSaving}
                                  className={userInputClass}
                                  value={guest.phone}
                                  onChange={(event) => setUserForm((form) => ({
                                    ...form,
                                    additionalGuests: form.additionalGuests.map((item, itemIndex) =>
                                      itemIndex === index ? { ...item, phone: event.target.value } : item,
                                    ),
                                  }))}
                                />
                              </label>
                              <label className={`${userLabelClass} lg:col-span-3`}>
                                <span>Government ID type <span className="text-red-600" aria-hidden="true">*</span></span>
                                <select
                                  required
                                  disabled={editorSaving}
                                  className={userInputClass}
                                  value={guest.idDocumentType}
                                  onChange={(event) => setUserForm((form) => ({
                                    ...form,
                                    additionalGuests: form.additionalGuests.map((item, itemIndex) =>
                                      itemIndex === index ? { ...item, idDocumentType: event.target.value } : item,
                                    ),
                                  }))}
                                >
                                  <option value="">Document type</option>
                                  <option value="AADHAAR">Aadhaar</option>
                                  <option value="PAN">PAN</option>
                                  <option value="VOTER_ID">Voter ID</option>
                                  <option value="PASSPORT">Passport</option>
                                  <option value="DRIVING_LICENSE">Driving licence</option>
                                  <option value="OTHER_GOVERNMENT_ID">Other government ID</option>
                                </select>
                              </label>
                              <label className={`${userLabelClass} lg:col-span-3`}>
                                <span>
                                  Government ID number {!guest.id && <span className="text-red-600" aria-hidden="true">*</span>}
                                  {guest.idDocumentLast4 && (
                                    <span className="block font-normal text-slate-500">
                                      Current: {guest.idDocumentType} ending in {guest.idDocumentLast4}
                                    </span>
                                  )}
                                </span>
                                <input
                                  required={!guest.id}
                                  type="password"
                                  autoComplete="new-password"
                                  minLength={2}
                                  maxLength={128}
                                  disabled={editorSaving}
                                  className={userInputClass}
                                  placeholder={guest.id ? 'Enter to replace ID' : 'ID number'}
                                  value={guest.idDocumentNumber}
                                  onChange={(event) => setUserForm((form) => ({
                                    ...form,
                                    additionalGuests: form.additionalGuests.map((item, itemIndex) =>
                                      itemIndex === index ? { ...item, idDocumentNumber: event.target.value } : item,
                                    ),
                                  }))}
                                />
                              </label>
                              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200 sm:col-span-2 lg:col-span-6">
                                <input
                                  type="checkbox"
                                  disabled={editorSaving}
                                  checked={guest.sameAddressAsMainOccupant}
                                  onChange={(event) => setUserForm((form) => ({
                                    ...form,
                                    additionalGuests: form.additionalGuests.map((item, itemIndex) =>
                                      itemIndex === index
                                        ? {
                                            ...item,
                                            sameAddressAsMainOccupant: event.target.checked,
                                            addressCountry: event.target.checked ? form.addressCountry : item.addressCountry,
                                            addressCity: event.target.checked ? form.addressCity : item.addressCity,
                                            addressState: event.target.checked ? form.addressState : item.addressState,
                                            addressPincode: event.target.checked ? form.addressPincode : item.addressPincode,
                                            addressLine: event.target.checked ? form.addressLine : item.addressLine,
                                          }
                                        : item,
                                    ),
                                  }))}
                                />
                                Same address as main occupant
                              </label>
                              <div className="sm:col-span-2 lg:col-span-6">
                                <AddressFields
                                  value={guest}
                                  disabled={editorSaving || guest.sameAddressAsMainOccupant}
                                  onChange={(address) => setUserForm((form) => ({
                                    ...form,
                                    additionalGuests: form.additionalGuests.map((item, itemIndex) =>
                                      itemIndex === index ? { ...item, ...address } : item,
                                    ),
                                  }))}
                                />
                              </div>
                            </fieldset>
                          ))}
                        </div>
                      </fieldset>
                    )}
                    {userForm.customerPersona === 'HOTEL_GUEST' &&
                      editorMode === 'view' && userForm.additionalGuests.length > 0 && (
                      <section className="space-y-3 border border-slate-200 p-3 dark:border-slate-700 md:col-span-2">
                        <h3 className="text-xs font-bold uppercase">
                          Registered additional occupants ({userForm.guestCount})
                        </h3>
                        {userForm.additionalGuests.map((guest, index) => (
                          <div key={index} className="grid gap-1 border-t border-slate-200 pt-2 text-xs dark:border-slate-700 sm:grid-cols-2">
                            <p className="font-semibold">{guest.fullName}</p>
                            <p>{guest.dateOfBirth ? `Date of birth ${guest.dateOfBirth}` : 'Date of birth not provided'}{guest.gender ? ` · ${guest.gender}` : ''}</p>
                            <p>{guest.email || 'No email'}{guest.phone ? ` · ${guest.phone}` : ''}</p>
                            <p>{guest.idDocumentType} ending {guest.idDocumentLast4}</p>
                            <p>{addressStringFromParts(guest) || 'No address provided'}</p>
                          </div>
                        ))}
                      </section>
                    )}
  </>
);
