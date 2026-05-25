const formatBiosInstallDate = (rawDate) => {
  if (!rawDate || rawDate === "N/A") return "N/A";

  const cleanedDate = rawDate.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3");
  const datePart = cleanedDate.slice(0, 10); // "2020-12-17"

  const date = new Date(datePart);
  if (isNaN(date)) return "N/A"; // Handle invalid dates

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();

  return `${day}-${month}-${year}`;
};

export default formatBiosInstallDate;
