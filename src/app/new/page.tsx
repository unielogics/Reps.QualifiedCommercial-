"use client";

// Opening an application as its own page, for the nav entry.
//
// The form itself lives in a component because the portfolio opens the same
// thing in a modal, and the SMS consent block inside it must never exist in
// two versions: the record we store has to match what the owner actually read.

import NewApplicationForm from "@/components/NewApplicationForm";

export default function NewApplicationPage() {
  return (
    <>
      <div className="hd">
        <h2>Open an application</h2>
        <p className="lede">
          A name and a way to reach them is enough to start. The rest follows, and the
          documents fill in most of it.
        </p>
      </div>
      <div className="mt">
        <NewApplicationForm />
      </div>
    </>
  );
}
