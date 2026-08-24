export type ApplicationProfileData = {
  landlord_mortgagee: string | null;
  guarantor_home_address: string | null;
  guarantor_dob: string | null;
  selected_program: string | null;
  term_requested_months: number | null;
  collateral_description: string | null;
  use_of_proceeds_text: string | null;
};

export function applicationProfileReady(
  profile: ApplicationProfileData | null | undefined,
  fundingPurpose?: string | null,
): boolean {
  if (!profile) return false;
  const requiredText = [
    profile.guarantor_home_address,
    profile.guarantor_dob,
    profile.selected_program,
    profile.collateral_description,
    profile.use_of_proceeds_text,
  ];
  const equipmentProgram = fundingPurpose === "equipment"
    || (profile.selected_program ?? "").toLowerCase().includes("equipment");
  return requiredText.every((value) => Boolean(value?.trim()))
    && Number(profile.term_requested_months ?? 0) > 0
    && (!equipmentProgram || Boolean(profile.landlord_mortgagee?.trim()));
}
