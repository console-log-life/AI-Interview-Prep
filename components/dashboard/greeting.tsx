"use client";

import { useEffect, useState } from "react";

/**
 * Time-of-day greeting.
 *
 * Computed in the browser deliberately: the server's clock says nothing about
 * where the candidate actually is, and greeting someone with "Good morning"
 * at 9pm their time is the sort of small wrongness that makes a product feel
 * careless. The server renders the neutral fallback, and the effect corrects
 * it on hydration — no mismatch, no flash of an incorrect greeting.
 */
export function Greeting({ name }: { name: string }) {
  const [greeting, setGreeting] = useState("Welcome back");

  useEffect(() => {
    const hour = new Date().getHours();
    setGreeting(
      hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening",
    );
  }, []);

  return (
    <>
      {greeting}, {name}
    </>
  );
}
