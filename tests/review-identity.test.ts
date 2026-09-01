import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { it, expect } from 'vitest';

// Diagnostic reproduction only; isolated emulator, no production access.
it('blocks a profile email different from the authenticated identity', async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-molde-cloud-review',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
  try {
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'users', 'review-user'), {
        uid: 'review-user', role: 'user', companyId: 'review-company',
        email: 'actual@example.com',
      });
    });
    const db = env.authenticatedContext('review-user', {
      email: 'actual@example.com', email_verified: true,
    }).firestore();
    await assertFails(updateDoc(doc(db, 'users', 'review-user'), {
      email: 'different-person@example.com',
    }));
    expect((await getDoc(doc(db, 'users', 'review-user'))).data()?.email)
      .toBe('actual@example.com');
  } finally { await env.cleanup(); }
});

it('allows only verified authentication to establish an administrator identity', async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-identity-proof', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
  try {
    const unverified = env.authenticatedContext('person', { email: 'person@example.com', email_verified: false }).firestore();
    const verified = env.authenticatedContext('person', { email: 'person@example.com', email_verified: true }).firestore();
    await assertFails(setDoc(doc(unverified, 'verifiedIdentities', 'person'), { email: 'person@example.com', verifiedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(verified, 'verifiedIdentities', 'person'), { email: 'someone-else@example.com', verifiedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(verified, 'verifiedIdentities', 'another-uid'), { email: 'person@example.com', verifiedAt: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(verified, 'verifiedIdentities', 'person'), { email: 'person@example.com', verifiedAt: serverTimestamp() }));
  } finally { await env.cleanup(); }
});

it('requires verified identity on admin promotion, including legacy forged profiles', async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-admin-assignment', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
  try {
    await env.withSecurityRulesDisabled(async ctx => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'users', 'owner'), { role: 'superadmin', companyId: 'root' });
      await setDoc(doc(db, 'users', 'candidate'), { uid: 'candidate', role: 'pending', companyId: 'target', email: 'candidate@example.com' });
      await setDoc(doc(db, 'users', 'legacy-forgery'), { uid: 'legacy-forgery', role: 'pending', companyId: 'target', email: 'candidate@example.com' });
    });
    const owner = env.authenticatedContext('owner').firestore();
    const candidate = env.authenticatedContext('candidate', { email: 'candidate@example.com', email_verified: true }).firestore();
    await assertFails(updateDoc(doc(owner, 'users', 'candidate'), { role: 'admin' }));
    await assertSucceeds(setDoc(doc(candidate, 'verifiedIdentities', 'candidate'), { email: 'candidate@example.com', verifiedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(owner, 'users', 'candidate'), { role: 'admin' }));
    await assertFails(updateDoc(doc(owner, 'users', 'legacy-forgery'), { role: 'admin' }));
    await assertFails(setDoc(doc(owner, 'verifiedIdentities', 'legacy-forgery'), { email: 'candidate@example.com', verifiedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(owner, 'users', 'candidate'), { permissions: { createFolder: true } }));
  } finally { await env.cleanup(); }
});

it('blocks forged signup fields and permits correcting a legacy email from the login', async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-signup-identity', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
  try {
    const db = env.authenticatedContext('signup', { email: 'real@example.com', email_verified: false }).firestore();
    await assertFails(setDoc(doc(db, 'users', 'signup'), { uid: 'signup', role: 'pending', companyId: 'rosa-atelie', email: 'fake@example.com' }));
    await assertFails(setDoc(doc(db, 'users', 'signup'), { uid: 'other', role: 'pending', companyId: 'rosa-atelie', email: 'real@example.com' }));
    await assertSucceeds(setDoc(doc(db, 'users', 'signup'), { uid: 'signup', role: 'pending', companyId: 'rosa-atelie', email: 'real@example.com' }));
    await env.withSecurityRulesDisabled(async ctx => {
      await updateDoc(doc(ctx.firestore(), 'users', 'signup'), { email: 'legacy@example.com' });
    });
    await assertSucceeds(updateDoc(doc(db, 'users', 'signup'), { email: 'real@example.com' }));
  } finally { await env.cleanup(); }
});
