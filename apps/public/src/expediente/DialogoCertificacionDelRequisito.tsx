import type { CuentaBancariaPublicaDto } from '@validalo/api-client';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MarcoDelDialogoSubir } from '../boveda/MarcoDelDialogoSubir';
import { esActiva } from '../cuentas/cuentas';
import { DialogoAgregarCuenta } from '../cuentas/DialogoAgregarCuenta';
import { DialogoCertificacion } from '../cuentas/DialogoCertificacion';
import { useCuentasBancarias } from '../shared/api';
import { ErrorRecuperable, EsqueletoTarjetas } from '../shared/componentes';
import { cuentaDeLaEmpresa, debeProponerTrasSubir, pasoAlElegir, vinculoSinCuenta } from './certificacionBancaria';
import { DialogoProponerCuenta } from './DialogoProponerCuenta';
import { ElegirCuentaDelRequisito } from './ElegirCuentaDelRequisito';

interface Props {
  /** El vínculo con la empresa que pide la certificación: a ella se le propone la cuenta. Sin él solo se sube la certificación a la cuenta. */
  vinculoId: string | null;
  empresa: string;
  onCerrar: () => void;
}

type Paso =
  | { paso: 'elegir' }
  | { paso: 'agregar' }
  | { paso: 'subir'; cuenta: CuentaBancariaPublicaDto }
  | { paso: 'proponer'; cuenta: CuentaBancariaPublicaDto };

/**
 * La certificación bancaria que pide una empresa se sube con la cuenta a la que pertenece (CB-8), no como un documento suelto: elige la cuenta (o agrega una, que pide su
 * certificación), sube la certificación de <b>esa</b> cuenta con el diálogo de «Mis cuentas» y, si la empresa aún no tiene cuenta, propone designarla para ella: así la empresa recibe
 * la certificación y el requisito se cubre. Sin cuentas arranca en «Agregar cuenta».
 */
export function DialogoCertificacionDelRequisito(props: Props) {
  const { t } = useTranslation();
  const cuentas = useCuentasBancarias();
  const titulo = t('expediente.documentos.bancaria.elegir.titulo', { empresa: props.empresa });

  if (cuentas.isPending) {
    return (
      <MarcoDelDialogoSubir titulo={titulo} onCerrar={props.onCerrar}>
        <EsqueletoTarjetas cantidad={1} />
      </MarcoDelDialogoSubir>
    );
  }
  if (cuentas.isError) {
    return (
      <MarcoDelDialogoSubir titulo={titulo} onCerrar={props.onCerrar}>
        <ErrorRecuperable error={cuentas.error} onReintentar={() => void cuentas.refetch()} />
      </MarcoDelDialogoSubir>
    );
  }
  return <PasosDeLaCertificacion {...props} cuentas={cuentas.data} />;
}

/** Los pasos arrancan una sola vez (con o sin cuentas): al registrar una cuenta la lista cambia y el paso en curso no debe cambiar con ella. */
function PasosDeLaCertificacion({ cuentas, vinculoId, empresa, onCerrar }: Props & { cuentas: readonly CuentaBancariaPublicaDto[] }) {
  const [actual, setActual] = useState<Paso>(() => ({ paso: cuentas.some(esActiva) ? 'elegir' : 'agregar' }));
  const proponer = (cuenta: CuentaBancariaPublicaDto) => setActual({ paso: 'proponer', cuenta });

  if (actual.paso === 'agregar') {
    // La cuenta nueva ya quedó con su certificación: se propone a la empresa si aún no tiene cuenta; si ya tiene una, queda guardada en «Mis cuentas».
    return <DialogoAgregarCuenta onCerrar={onCerrar} onAgregada={(cuenta) => (vinculoSinCuenta(vinculoId, cuentas) ? proponer(cuenta) : onCerrar())} />;
  }
  if (actual.paso === 'subir') {
    const { cuenta } = actual;
    return (
      <DialogoCertificacion
        cuenta={cuenta}
        reemplaza={!cuenta.faltaCertificacion}
        onCerrar={onCerrar}
        onSubida={() => (debeProponerTrasSubir(vinculoId, cuentas) ? proponer(cuenta) : onCerrar())}
      />
    );
  }
  if (actual.paso === 'proponer') {
    return vinculoId ? <DialogoProponerCuenta cuenta={actual.cuenta} vinculoId={vinculoId} empresa={empresa} onCerrar={onCerrar} /> : null;
  }
  return (
    <ElegirCuentaDelRequisito
      empresa={empresa}
      activas={cuentas.filter(esActiva)}
      deLaEmpresa={cuentaDeLaEmpresa(vinculoId, cuentas)}
      onElegir={(cuenta) => (pasoAlElegir(cuenta, vinculoId, cuentas) === 'proponer' ? proponer(cuenta) : setActual({ paso: 'subir', cuenta }))}
      onAgregar={() => setActual({ paso: 'agregar' })}
      onCerrar={onCerrar}
    />
  );
}
