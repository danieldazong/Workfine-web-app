async function run() {
  const workspaces = await db.collection("workspaces").get();
  let patched = 0;
  let skipped = 0;

  for (const ws of workspaces.docs) {
    const tasks = await ws.ref.collection("tasks").get();

    for (const taskDoc of tasks.docs) {
      const taskData = taskDoc.data() || {};

      // Base email set from the task doc (your original sources).
      const baseEmails = new Set(
        [
          ...(Array.isArray(taskData.sharedWithEmails) ? taskData.sharedWithEmails : []),
          ...(Array.isArray(taskData.sharedEmails) ? taskData.sharedEmails : []),
          ...(Array.isArray(taskData.guestEmails) ? taskData.guestEmails : []),
          // NEW: owner/creator email so the owner can always read guest comments.
          taskData.ownerEmail,
          taskData.createdByEmail,
        ]
          .map(normEmail)
          .filter(Boolean),
      );

      // NEW: pull every email off the task's shares subcollection.
      try {
        const shares = await taskDoc.ref.collection("shares").get();
        shares.docs.forEach((s) => {
          const sd = s.data() || {};
          [
            sd.sharedWithEmail,
            sd.sharedWithEmailLower,
            sd.invitedEmail,
            sd.invitedEmailLower,
            sd.acceptedByEmail,
            sd.sharedByEmail,
            sd.invitedByEmail,
            sd.ownerEmail,
          ]
            .map(normEmail)
            .filter(Boolean)
            .forEach((e) => baseEmails.add(e));
        });
      } catch (e) {
        // shares subcollection may not exist for some tasks; ignore.
      }

      const comments = await taskDoc.ref.collection("comments").get();
      if (comments.empty) continue;

      let batch = db.batch();
      let ops = 0;

      for (const c of comments.docs) {
        const cData = c.data() || {};

        // MERGE the array: keep emails already on the comment, add task/share
        // emails, add the author's own email. Never wipe good data.
        const merged = new Set(baseEmails);
        (Array.isArray(cData.sharedEmailsLower) ? cData.sharedEmailsLower : [])
          .map(normEmail)
          .filter(Boolean)
          .forEach((e) => merged.add(e));
        const authorEmail = normEmail(cData.authorEmail);
        if (authorEmail) merged.add(authorEmail);

        const next = Array.from(merged);
        const existing = Array.isArray(cData.sharedEmailsLower)
          ? cData.sharedEmailsLower
          : [];

        // Idempotent: skip if nothing changes.
        const same =
          existing.length === next.length &&
          next.every((e) => existing.includes(e));
        if (same || next.length === 0) {
          skipped++;
          continue;
        }

        batch.set(c.ref, { sharedEmailsLower: next }, { merge: true });
        ops++;
        patched++;
        if (ops === 400) {
          await batch.commit();
          batch = db.batch();
          ops = 0;
        }
      }
      if (ops > 0) await batch.commit();
    }
  }

  console.log(`Backfill complete. Patched ${patched} comment docs. Skipped ${skipped}.`);
  process.exit(0);
}
