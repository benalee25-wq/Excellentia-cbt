// Refuse to run inside someone else's page (clickjacking protection)
if (top !== self) { document.documentElement.innerHTML = ''; top.location = self.location; }
