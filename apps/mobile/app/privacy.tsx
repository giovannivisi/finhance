import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Linking, View } from "react-native";

import { useServerConnection } from "@/api/server-connection";
import {
  AppText,
  Button,
  Card,
  ErrorState,
  Screen,
  Section,
  SkeletonCard,
} from "@/components/ui";
import { useFormatters } from "@/prefs";
import { spacing } from "@/theme";

interface PrivacyContact {
  name: string;
  email: string | null;
  website: string | null;
  postalAddress: string | null;
  instructions: string | null;
}

interface MobilePrivacyNotice {
  deploymentMode: "local" | "managed" | "mixed";
  lastUpdated: string;
  controller: PrivacyContact;
  dpo?: PrivacyContact | null;
  rightsContact: PrivacyContact;
  supervisoryAuthority: { name: string; complaintUrl: string };
  categoryGroups: { title: string; items: string[] }[];
  sourceOfData: string[];
  consequenceOfNotProviding?: string;
  processingActivities: {
    key: string;
    title: string;
    purpose: string;
    dataCategories: string[];
    legalBasis: {
      basis: string;
      explanation: string;
      legitimateInterests: string | null;
    };
  }[];
  processors?: {
    name: string;
    role: string;
    purpose: string;
    location: string;
    dataCategories: string[];
  }[];
  transfers?: {
    destination: string;
    purpose: string;
    dataCategories: string[];
    safeguard: string;
  }[];
  retention: {
    key: string;
    title: string;
    retention: string;
    detail: string;
  }[];
  rightsStatements?: string[];
  automatedDecisionMaking: string;
}

async function fetchHostedPrivacyNotice(
  serverUrl: string,
): Promise<MobilePrivacyNotice> {
  const response = await fetch(`${serverUrl}/api/mobile/privacy`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("The hosted privacy notice is unavailable.");
  }
  return (await response.json()) as MobilePrivacyNotice;
}

function NoticeCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <AppText variant="title3" accessibilityRole="header">
          {title}
        </AppText>
        {children}
      </View>
    </Card>
  );
}

function NoticeText({ children }: { children: ReactNode }) {
  return (
    <AppText variant="body" tone="secondary" selectable>
      {children}
    </AppText>
  );
}

function NoticeList({ items }: { items: string[] }) {
  return (
    <View style={{ gap: spacing.md }}>
      {items.map((item) => (
        <View key={item} style={{ flexDirection: "row", gap: spacing.sm }}>
          <NoticeText>•</NoticeText>
          <AppText
            variant="body"
            tone="secondary"
            selectable
            style={{ flex: 1 }}
          >
            {item}
          </AppText>
        </View>
      ))}
    </View>
  );
}

function ContactCard({
  title,
  contact,
}: {
  title: string;
  contact: PrivacyContact;
}) {
  return (
    <NoticeCard title={title}>
      <NoticeText>{contact.name}</NoticeText>
      {contact.email ? <NoticeText>Email: {contact.email}</NoticeText> : null}
      {contact.website ? (
        <NoticeText>Website: {contact.website}</NoticeText>
      ) : null}
      {contact.postalAddress ? (
        <NoticeText>Postal address: {contact.postalAddress}</NoticeText>
      ) : null}
      {contact.instructions ? (
        <NoticeText>{contact.instructions}</NoticeText>
      ) : null}
    </NoticeCard>
  );
}

export default function PrivacyScreen() {
  const format = useFormatters();
  const { serverMode, serverUrl } = useServerConnection();
  const [linkError, setLinkError] = useState<string | null>(null);
  const canLoadNotice = serverMode === "hosted" && Boolean(serverUrl);
  const privacyQuery = useQuery({
    queryKey: ["mobile-privacy", serverUrl] as const,
    queryFn: () => fetchHostedPrivacyNotice(serverUrl ?? ""),
    enabled: canLoadNotice,
    staleTime: 5 * 60_000,
  });
  const notice = privacyQuery.data ?? null;

  const openWebsite = async (url: string) => {
    setLinkError(null);
    try {
      await Linking.openURL(url);
    } catch {
      setLinkError(
        "The website could not be opened. Please try again or copy the address into your browser.",
      );
    }
  };

  return (
    <Screen title="Privacy notice" showBack fixedHeader>
      <Card surface="muted">
        <View style={{ gap: spacing.md }}>
          <AppText variant="bodySemibold">
            {notice?.controller.name ?? "Connected workspace"}
          </AppText>
          <NoticeText>
            {notice
              ? `Last updated ${format.date(notice.lastUpdated)}.`
              : canLoadNotice
                ? "Loading the privacy notice for this workspace."
                : "The local workspace operator controls the full privacy notice."}
          </NoticeText>
        </View>
      </Card>

      <Section title="On this device">
        <NoticeCard title="Mobile storage and security">
          <NoticeList
            items={[
              "The server URL, connection mode, theme and hide-amounts preferences are stored on this device.",
              "Hosted sign-in stores access and refresh credentials in secure storage. On iOS they are bound to this device. Signing out or disconnecting removes them; uninstalling the app alone may not erase keychain items.",
              "App lock stores a salted passcode verifier, biometric preference, failed-attempt and lockout state, and timestamps in device-only secure storage. These records are not sent to the workspace server. Disable app lock to remove its secure-storage record.",
              "Biometric checks are handled by the operating system. Finhance does not receive fingerprint or face templates, or passkey private keys.",
              "Data screens cache finance records in memory while the app is open.",
            ]}
          />
        </NoticeCard>
      </Section>

      {canLoadNotice && privacyQuery.isPending ? (
        <>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </>
      ) : privacyQuery.isError ? (
        <ErrorState
          error={privacyQuery.error}
          onRetry={() => privacyQuery.refetch()}
        />
      ) : notice ? (
        <>
          <Section title="Controller and contacts">
            <View style={{ gap: spacing.md }}>
              <ContactCard title="Controller" contact={notice.controller} />
              <ContactCard
                title="Rights requests"
                contact={notice.rightsContact}
              />
              {notice.dpo ? (
                <ContactCard
                  title="Data protection contact"
                  contact={notice.dpo}
                />
              ) : null}
            </View>
          </Section>
          <Section title="What personal data is processed">
            <View style={{ gap: spacing.md }}>
              {notice.categoryGroups.map((group) => (
                <NoticeCard key={group.title} title={group.title}>
                  <NoticeList items={group.items} />
                </NoticeCard>
              ))}
            </View>
          </Section>
          <Section title="Sources of data">
            <Card>
              <NoticeList items={notice.sourceOfData} />
            </Card>
          </Section>
          <Section title="Purposes and legal bases">
            <View style={{ gap: spacing.md }}>
              {notice.processingActivities.map((activity) => (
                <NoticeCard key={activity.key} title={activity.title}>
                  <NoticeText>{activity.purpose}</NoticeText>
                  <NoticeText>
                    Legal basis: {activity.legalBasis.basis}
                  </NoticeText>
                  <NoticeText>{activity.legalBasis.explanation}</NoticeText>
                  {activity.legalBasis.legitimateInterests ? (
                    <NoticeText>
                      Legitimate interests:{" "}
                      {activity.legalBasis.legitimateInterests}
                    </NoticeText>
                  ) : null}
                  <NoticeList items={activity.dataCategories} />
                </NoticeCard>
              ))}
            </View>
          </Section>
          {notice.processors?.length ? (
            <Section title="Recipients and processors">
              <View style={{ gap: spacing.md }}>
                {notice.processors.map((processor) => (
                  <NoticeCard
                    key={`${processor.name}-${processor.purpose}`}
                    title={processor.name}
                  >
                    <NoticeText>{processor.role}</NoticeText>
                    <NoticeText>{processor.purpose}</NoticeText>
                    <NoticeText>Location: {processor.location}</NoticeText>
                    <NoticeList items={processor.dataCategories} />
                  </NoticeCard>
                ))}
              </View>
            </Section>
          ) : null}
          {notice.transfers?.length ? (
            <Section title="International transfers">
              <View style={{ gap: spacing.md }}>
                {notice.transfers.map((transfer) => (
                  <NoticeCard
                    key={`${transfer.destination}-${transfer.purpose}`}
                    title={transfer.destination}
                  >
                    <NoticeText>{transfer.purpose}</NoticeText>
                    <NoticeList items={transfer.dataCategories} />
                    <NoticeText>Safeguards: {transfer.safeguard}</NoticeText>
                  </NoticeCard>
                ))}
              </View>
            </Section>
          ) : null}
          <Section title="How long data is kept">
            <View style={{ gap: spacing.md }}>
              {notice.retention.map((entry) => (
                <NoticeCard key={entry.key} title={entry.title}>
                  <NoticeText>{entry.retention}</NoticeText>
                  <NoticeText>{entry.detail}</NoticeText>
                </NoticeCard>
              ))}
            </View>
          </Section>
          <Section title="Your rights and complaints">
            <NoticeCard title="Your choices">
              <NoticeList
                items={
                  notice.rightsStatements ?? [
                    "Depending on the applicable law, you may have rights of access, rectification, erasure, restriction, objection and portability. Contact the rights contact above to make a request.",
                    "You may withdraw cloud-parser consent at any time in Settings without affecting the lawfulness of earlier processing. Basic parsing remains available.",
                  ]
                }
              />
              <NoticeText>
                You can complain to {notice.supervisoryAuthority.name}.
              </NoticeText>
              <NoticeText>
                {notice.supervisoryAuthority.complaintUrl}
              </NoticeText>
              <Button
                label="Open complaints website"
                variant="secondary"
                onPress={() =>
                  void openWebsite(notice.supervisoryAuthority.complaintUrl)
                }
              />
            </NoticeCard>
          </Section>
          {notice.consequenceOfNotProviding ? (
            <NoticeCard title="If you choose not to provide data">
              <NoticeText>{notice.consequenceOfNotProviding}</NoticeText>
            </NoticeCard>
          ) : null}
          <NoticeCard title="Automated decision-making">
            <NoticeText>{notice.automatedDecisionMaking}</NoticeText>
          </NoticeCard>
          <Button
            label="Open notice in your browser"
            variant="secondary"
            onPress={() => void openWebsite(`${serverUrl}/privacy`)}
          />
          {linkError ? (
            <Card surface="warning">
              <NoticeText>{linkError}</NoticeText>
            </Card>
          ) : null}
        </>
      ) : (
        <NoticeCard title="Local workspace notice">
          <NoticeText>
            This app is connected directly to an API server. Read the privacy
            notice at /privacy in the web app belonging to the same deployment
            for the operator&apos;s contacts, processing purposes, recipients,
            transfers and retention periods.
          </NoticeText>
        </NoticeCard>
      )}
    </Screen>
  );
}
