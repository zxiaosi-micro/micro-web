// locales/en-US.ts · ops App 英文词条（satisfies OpsMessages 强制与 zh 正本同型，漏键编译期报错）。

import type { OpsMessages } from "./zh-CN";

const en = {
  // ── Page titles ──
  "page.login": "Station Mini Program",
  "page.workbench": "Station Workbench",
  "page.alerts": "Alerts",
  "page.tickets": "Tickets",
  "page.inspections": "Inspections",

  // ── Workbench ──
  "wb.loadingStation": "Loading station...",
  "wb.loadingMe": "Fetching station identity...",
  "wb.unreadAlerts": "Unread Alerts (10s delta)",
  "wb.activeTickets": "Active Tickets (10s delta)",
  "wb.goAlerts": "Alerts",
  "wb.goTickets": "Tickets",
  "wb.goInspections": "Inspections",
  "wb.latestAlerts": "Latest Alerts",
  "wb.latestTickets": "Latest Tickets",
  "wb.refresh": "Refresh",
  "wb.noAlerts": "No alerts",
  "wb.noTickets": "No tickets",

  // ── Login ──
  "login.subtitle": "For station staff (data_scope locks this station)",
  "login.mobile": "Mobile",
  "login.password": "Password",
  "login.mobilePlaceholder": "Enter mobile number",
  "login.passwordPlaceholder": "Enter password",
  "login.needBoth": "Enter mobile number and password",
  "login.expired": "Session expired, please log in again",
  "login.lockedRetry": "Account locked, retry in {{seconds}}s",
  "login.locked": "Locked ({{seconds}}s)",
  "login.failed": "Login failed",

  // ── Alerts ──
  "al.stOpen": "Unacknowledged",
  "al.stAcked": "Acknowledged",
  "al.stClosed": "Closed",
  "al.all": "All",
  "al.empty": "No alerts",
  "al.ack": "Acknowledge",
  "al.ackDone": "Acknowledged",
  "al.ackFailed": "Acknowledge failed",
  "al.toTicket": "To Ticket",
  "al.transferTitle": "Convert Alert to Ticket",
  "al.autoDispatch": "Auto-dispatch after creation (region + skill matching)",
  "al.generate": "Generate",
  "al.generateAuto": "Generate (auto-dispatch)",
  "al.generated": "Ticket {{no}} generated{{auto}}",
  "al.generatedAuto": " and auto-dispatched",
  "al.transferFailed": "Convert to ticket failed",

  // ── Tickets ──
  "tk.stDispatched": "Pending Accept",
  "tk.stAccepted": "Accepted",
  "tk.stProcessing": "Processing",
  "tk.stSubmitted": "Pending Verification",
  "tk.all": "All",
  "tk.empty": "No tickets",
  "tk.assignee": "Assignee",
  "tk.escalate": "Escalations",
  "tk.actFailed": "Operation failed",
  "tk.accept": "Accept",
  "tk.accepted": "Accepted",
  "tk.start": "Start Work",
  "tk.started": "Work started",
  "tk.submit": "Submit",
  "tk.submitted": "Submitted",
  "tk.submitTitle": "Submit Work Result: {{no}}",
  "tk.resultPlaceholder": "Work result notes",

  // ── Inspections ──
  "ins.stPending": "Pending",
  "ins.all": "All",
  "ins.item1": "Visual check",
  "ins.item2": "Connection tightening",
  "ins.item3": "Odor & noise",
  "ins.empty": "No inspection tasks",
  "ins.anomaly": "{{count}} anomalous",
  "ins.plan": "Scheduled",
  "ins.batchSubmit": "Batch Submit",
  "ins.batchTitle": "Batch Inspection Submit: {{title}}",
  "ins.loadingDetail": "Loading inspection items...",
  "ins.result": "Result",
  "ins.switchHint": "Switch on = item anomalous (server auto-raises a ticket on submit)",
  "ins.location": "Location",
  "ins.noLocation": "Not fetched (gcj02)",
  "ins.getLocation": "Fetch Location",
  "ins.submit": "Submit Inspection",
  "ins.submitted": "Inspection Submitted",
  "ins.submittedContent": "{{count}} anomalous items{{tickets}}",
  "ins.submittedTickets": ", tickets raised: {{tickets}}",
  "ins.planTime": "Scheduled At",
  "ins.anomalous": "Anomalous (raise ticket)",
  "ins.submitFailed": "Submit failed",

  // ── Preferences ──
  "prefs.section": "Preferences",
  "prefs.language": "Language",
  "prefs.theme": "Dark Mode",
  "prefs.themeOn": "On",
  "prefs.themeOff": "Off",
};

export default en satisfies OpsMessages;
