# Urban Castle Android background tracker

This native companion keeps GPS collection alive with an Android foreground location service and a persistent notification.

1. In Urban Castle → GPS Tracking, select exactly one staff member and generate a 15-minute enrollment code.
2. Build and install this Android app, enter that code once, and grant precise/background location plus notifications.
3. Tap **Start 24/7 tracking**. Each phone receives an independent, revocable GPS-only token.
4. The app queues up to 2,880 points while offline and uploads them in a batch when connectivity returns.

The web app remains explicitly foreground-only. Android may still require the user to set battery usage to **Unrestricted** on vendors that aggressively suspend foreground services. Release builds must be signed and distributed through the organization’s managed channel.
