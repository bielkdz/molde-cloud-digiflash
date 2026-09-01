import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@azure/msal-browser', () => ({
  InteractionRequiredAuthError: class extends Error {},
  PublicClientApplication: class {
    initialize = async () => {};
    handleRedirectPromise = async () => null;
    getAllAccounts = () => [{ username: 'drive@example.com' }];
    getActiveAccount = () => ({ username: 'drive@example.com' });
    setActiveAccount = () => {};
    acquireTokenSilent = async () => ({ accessToken: 'test-token' });
  },
}));
import { uploadPhotoToOneDrive, oneDriveErrorMessage } from '../src/onedrive';

class RequestMock {
  static instances: RequestMock[] = [];
  static status = 201;
  static response = JSON.stringify({ id: 'new-photo', name: 'Foto.jpg', size: 3, webUrl: 'https://example.com/photo' });
  static event = 'load';
  status = RequestMock.status;
  responseText = RequestMock.response;
  timeout = 0;
  url = '';
  body?: File;
  handlers: Record<string, () => void> = {};
  upload = { addEventListener: vi.fn() };
  constructor() { RequestMock.instances.push(this); }
  open(_method: string, url: string) { this.url = url; }
  setRequestHeader = vi.fn();
  addEventListener(event: string, callback: () => void) { this.handlers[event] = callback; }
  send(file: File) { this.body = file; queueMicrotask(() => this.handlers[RequestMock.event]?.()); }
}
beforeEach(() => {
  RequestMock.instances = [];
  RequestMock.status = 201;
  RequestMock.response = JSON.stringify({ id: 'new-photo', name: 'Foto.jpg', size: 3 });
  RequestMock.event = 'load';
  vi.stubGlobal('window', { location: { origin: 'http://localhost' } });
  vi.stubGlobal('XMLHttpRequest', RequestMock);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ id: 'folder' }) })));
});
afterEach(() => vi.unstubAllGlobals());

it('requests atomic conflict rejection and sends the original bytes', async () => {
  const file = new File(['abc'], 'original.jpg', { type: 'image/jpeg' });
  await uploadPhotoToOneDrive('Pasta', 'Foto', file);
  const request = RequestMock.instances[0];
  expect(new URL(request.url).searchParams.get('@microsoft.graph.conflictBehavior')).toBe('fail');
  expect(request.body).toBe(file);
  expect(request.timeout).toBe(120000);
});
it('rejects repeated names without retrying with replacement', async () => {
  RequestMock.status = 409;
  RequestMock.response = '{"error":{"code":"nameAlreadyExists"}}';
  await expect(uploadPhotoToOneDrive('Pasta', 'Foto', new File(['abc'], 'photo.jpg'))).rejects.toThrow('onedrive/409');
  expect(RequestMock.instances).toHaveLength(1);
  expect(oneDriveErrorMessage(new Error('onedrive/409:conflict'))).toContain('foto anterior foi preservada');
});
it('settles malformed upload responses instead of hanging', async () => {
  RequestMock.response = 'invalid json';
  await expect(uploadPhotoToOneDrive('Pasta', 'Foto', new File(['abc'], 'photo.jpg'))).rejects.toThrow('invalid-upload-response');
});
it('settles timeout with an uncertain-result warning', async () => {
  RequestMock.event = 'timeout';
  await expect(uploadPhotoToOneDrive('Pasta', 'Foto', new File(['abc'], 'photo.jpg'))).rejects.toThrow('upload-timeout');
});
