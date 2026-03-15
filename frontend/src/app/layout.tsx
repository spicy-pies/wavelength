import type { Metadata } from "next";
import "./globals.css";
import { LocationProvider } from "@/contexts/LocationContext";

export const metadata: Metadata = {
  title: "Wavelength — Find your people nearby",
  description:
    "Compatibility between people in the same physical space. Connect only when interest is mutual.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <LocationProvider>{children}</LocationProvider>
      </body>
    </html>
  );
}
