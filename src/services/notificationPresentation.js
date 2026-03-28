const ACTION_PRESENTATION = {
  ride_accepted: {
    category: "ride",
    preferenceKey: "ride_accepted",
    icon: "car-sport",
    color: "emerald",
    route: "ride-details",
  },
  booking_confirmed: {
    category: "booking",
    preferenceKey: "ride_accepted",
    icon: "checkmark-circle",
    color: "emerald",
    route: "ride-details",
  },
  new_booking_request: {
    category: "booking",
    preferenceKey: "booking_confirmations",
    icon: "receipt",
    color: "amber",
    route: "ride-details",
  },
  passenger_joined: {
    category: "booking",
    preferenceKey: "booking_confirmations",
    icon: "person-add",
    color: "emerald",
    route: "ride-details",
  },
  booking_declined: {
    category: "booking",
    preferenceKey: "ride_cancelled",
    icon: "close-circle",
    color: "rose",
    route: "ride-details",
  },
  booking_cancelled_by_user: {
    category: "booking",
    preferenceKey: "ride_cancelled",
    icon: "close-circle",
    color: "rose",
    route: "ride-details",
  },
  driver_arrived: {
    category: "ride",
    preferenceKey: "driver_arriving",
    icon: "navigate-circle",
    color: "sky",
    route: "active-ride",
  },
  ride_started: {
    category: "ride",
    preferenceKey: "ride_started",
    icon: "play-circle",
    color: "sky",
    route: "active-ride",
  },
  ride_completed: {
    category: "ride",
    preferenceKey: "ride_completed",
    icon: "flag",
    color: "slate",
    route: "active-ride",
  },
  ride_cancelled: {
    category: "ride",
    preferenceKey: "ride_cancelled",
    icon: "close-circle",
    color: "rose",
    route: "ride-details",
  },
  matching_ride_available: {
    category: "ride",
    preferenceKey: "ride_requests",
    icon: "car",
    color: "violet",
    route: "available-rides",
  },
  passenger_checked_in: {
    category: "booking",
    preferenceKey: "booking_confirmations",
    icon: "key",
    color: "amber",
    route: "active-ride",
  },
  payment_status_updated: {
    category: "booking",
    preferenceKey: "payment_updates",
    icon: "wallet",
    color: "emerald",
    route: "ride-details",
  },
  payment_sent_by_passenger: {
    category: "booking",
    preferenceKey: "payment_updates",
    icon: "cash",
    color: "sky",
    route: "active-ride",
  },
  new_rating: {
    category: "account",
    preferenceKey: "earnings_updates",
    icon: "star",
    color: "amber",
    route: "notifications",
  },
  driver_profile_updated: {
    category: "account",
    preferenceKey: "application_updates",
    icon: "person-circle",
    color: "sky",
    route: "notifications",
  },
  license_updated: {
    category: "account",
    preferenceKey: "application_updates",
    icon: "document-text",
    color: "sky",
    route: "notifications",
  },
  vehicle_image_updated: {
    category: "account",
    preferenceKey: "application_updates",
    icon: "images",
    color: "sky",
    route: "notifications",
  },
  broadcast_message: {
    category: "broadcast",
    preferenceKey: "broadcast_messages",
    icon: "megaphone",
    color: "violet",
    route: "notifications",
  },
  support_update: {
    category: "system",
    preferenceKey: "support_tickets",
    icon: "help-buoy",
    color: "sky",
    route: "notifications",
  },
};

const TYPE_FALLBACK = {
  booking: {
    category: "booking",
    preferenceKey: "booking_confirmations",
    icon: "receipt",
    color: "amber",
    route: "notifications",
  },
  ride: {
    category: "ride",
    preferenceKey: "ride_started",
    icon: "car-sport",
    color: "sky",
    route: "notifications",
  },
  broadcast: {
    category: "broadcast",
    preferenceKey: "broadcast_messages",
    icon: "megaphone",
    color: "violet",
    route: "notifications",
  },
  promotion: {
    category: "promotion",
    preferenceKey: "promotional_messages",
    icon: "pricetag",
    color: "violet",
    route: "notifications",
  },
  account: {
    category: "account",
    preferenceKey: "application_updates",
    icon: "person-circle",
    color: "sky",
    route: "notifications",
  },
  security: {
    category: "security",
    preferenceKey: "system_alerts",
    icon: "shield-checkmark",
    color: "rose",
    route: "notifications",
  },
  system: {
    category: "system",
    preferenceKey: "system_alerts",
    icon: "notifications",
    color: "slate",
    route: "notifications",
  },
};

function getAction(metadata = {}, type = "system") {
  return metadata?.action || metadata?.event || type;
}

function deriveNotificationPresentation(type = "system", metadata = {}) {
  const action = getAction(metadata, type);
  const match = ACTION_PRESENTATION[action] || TYPE_FALLBACK[type] || TYPE_FALLBACK.system;
  return {
    action,
    category: match.category,
    preferenceKey: match.preferenceKey,
    presentation: {
      icon: match.icon,
      color: match.color,
      route: match.route,
    },
  };
}

function enrichNotificationMetadata(type = "system", metadata = {}) {
  const derived = deriveNotificationPresentation(type, metadata);
  return {
    ...metadata,
    action: derived.action,
    preference_key: metadata.preference_key || derived.preferenceKey,
    category: metadata.category || derived.category,
    route: metadata.route || derived.presentation.route,
    presentation: {
      ...(derived.presentation || {}),
      ...((metadata && metadata.presentation) || {}),
    },
  };
}

module.exports = {
  deriveNotificationPresentation,
  enrichNotificationMetadata,
};
