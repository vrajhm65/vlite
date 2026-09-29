/**
 * Simple auth utility.
 * Gets token from localStorage and attaches to requests.
 */
export function getToken() {
  return localStorage.getItem('vlite_token');
}

export function setToken(token) {
  localStorage.setItem('vlite_token', token);
}

export function removeToken() {
  localStorage.removeItem('vlite_token');
}

export function isAuthenticated() {
  return !!localStorage.getItem('vlite_token');
}
