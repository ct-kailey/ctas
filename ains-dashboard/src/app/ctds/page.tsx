import Link from "next/link";
import { Button } from "@/components/ctds/Button";
import styles from "./page.module.css";

export default function Page() {
  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <p className={styles.eyebrow}>AINS · CTDS</p>
        <h1>화면 설정은 기존 작업실에서 확인하세요</h1>
        <p>이 대시보드는 예시 데이터를 사용하는 정적 프리뷰입니다. 서버 파일을 수정하는 CTDS 온보딩은 제공하지 않습니다.</p>
        <p>기존 작업실의 화면 설정으로 이동해 색상과 화면 밀도 등을 확인할 수 있습니다. 두 화면의 브라우저 설정은 별도로 관리됩니다.</p>
        <nav className={styles.actions} aria-label="화면 이동">
          <Button variant="primary" asChild><a href="/ctds">기존 작업실 화면 설정</a></Button>
          <Button variant="outline" asChild><Link href="/">예시 대시보드로</Link></Button>
        </nav>
      </section>
    </main>
  );
}
