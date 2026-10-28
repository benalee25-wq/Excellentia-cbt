// Safety net: if the site is opened with http://, send the visitor to the secure https:// address
try { if (location.protocol === 'http:' && !/^(localhost|127\.|\[::1\])/.test(location.hostname)) location.replace('https:' + location.href.slice(5)); } catch (e) {}
// Refuse to run inside someone else's page (clickjacking protection)
if (top !== self) { document.documentElement.innerHTML = ''; top.location = self.location; }
// Apply the saved look (colour template and light/dark) before the page paints
try { var s = localStorage.getItem('cbt-skin'), t = localStorage.getItem('cbt-theme'); if (s) document.documentElement.dataset.skin = s; if (t) document.documentElement.dataset.theme = t; } catch (e) {}
