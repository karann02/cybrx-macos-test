const formatInstallDate = async (installDate) => {
  if (!installDate || installDate.length !== 8) return "Unknown";

  const year = installDate.substring(0, 4);
  const month = installDate.substring(4, 6);
  const day = installDate.substring(6, 8);

  return `${year}-${month}-${day}`; // Output: YYYY-MM-DD
};

export default formatInstallDate;
