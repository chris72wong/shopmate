"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { currencyForCountry, locationInputSchema, type Country } from "@/contracts";

const countries: { code: Country; name: string }[] = [
  { code: "CA", name: "Canada" },
  { code: "US", name: "United States" },
];

function Arrow({ back = false }: { back?: boolean }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d={back ? "m14 6-6 6 6 6" : "m9 6 6 6-6 6"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

export function LocationFlow() {
  const router = useRouter();
  const [country, setCountry] = useState<Country | null>(null);
  const [postalCodes, setPostalCodes] = useState<Record<Country, string>>({ CA: "", US: "" });
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const countryRefs = useRef<Partial<Record<Country, HTMLButtonElement | null>>>({});
  const previousCountry = useRef<Country | null>(null);

  useEffect(() => {
    if (country) inputRef.current?.focus();
    else if (previousCountry.current) countryRefs.current[previousCountry.current]?.focus();
    previousCountry.current = country;
  }, [country]);

  function continueToDemo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!country || isPending) return;
    const location = locationInputSchema.safeParse({ country, postalCode: postalCodes[country] });
    if (!location.success) {
      setError(country === "CA" ? "Enter a valid postal code, like M5V 2T6." : "Enter a valid ZIP code, like 02108 or 02108-1234.");
      inputRef.current?.focus();
      return;
    }
    setError("");
    setPostalCodes((codes) => ({ ...codes, [country]: location.data.postalCode }));
    // Explicit demo only. The fictional stores do not use or retain the postal code.
    startTransition(() => router.push(`/demo?country=${location.data.country}`));
  }

  return <section className="location-screen" aria-labelledby="location-title">
    <div className="location-panel">
      {country === null ? <>
        <h1 id="location-title">Choose your country</h1>
        <div className="country-options">
          {countries.map((option) => <button
            key={option.code}
            ref={(element) => { countryRefs.current[option.code] = element; }}
            type="button"
            className="country-option"
            onClick={() => { setError(""); setCountry(option.code); }}
            aria-label={option.name}
          >
            <span className="country-code" aria-hidden="true">{option.code}</span>
            <span className="country-name">{option.name}</span>
            <span className="country-currency" aria-hidden="true">{currencyForCountry(option.code)}</span>
            <Arrow />
          </button>)}
        </div>
      </> : <>
        <button type="button" className="location-back" disabled={isPending} onClick={() => { setError(""); setCountry(null); }} aria-label="Change country">
          <Arrow back /> {country === "CA" ? "Canada" : "United States"}<span className="selected-currency">{currencyForCountry(country)}</span>
        </button>
        <h1 id="location-title">Enter your {country === "CA" ? "postal code" : "ZIP code"}</h1>
        <form onSubmit={continueToDemo} noValidate aria-busy={isPending}>
          <label htmlFor="postal-code" className="sr-only">{country === "CA" ? "Postal code" : "ZIP code"}</label>
          <input
            ref={inputRef}
            id="postal-code"
            name="postalCode"
            type="text"
            className="location-input"
            value={postalCodes[country]}
            onChange={(event) => { setPostalCodes((codes) => ({ ...codes, [country]: event.target.value })); setError(""); }}
            placeholder={country === "CA" ? "M5V 2T6" : "02108"}
            autoComplete="postal-code"
            autoCapitalize={country === "CA" ? "characters" : "off"}
            spellCheck={false}
            maxLength={16}
            disabled={isPending}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "postal-code-error demo-note" : "demo-note"}
          />
          {error && <p id="postal-code-error" className="field-error" role="alert">{error}</p>}
          <button type="submit" className="button button-primary location-continue" disabled={isPending}>
            {isPending ? "Continuing…" : "Continue to demo"}<Arrow />
          </button>
          <p id="demo-note" className="location-note">Fictional stores. Illustrative prices.</p>
        </form>
      </>}
    </div>
  </section>;
}
