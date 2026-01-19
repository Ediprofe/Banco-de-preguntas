import zipfile
import os
import sys
import xml.etree.ElementTree as ET

# Namespaces de Word
W_NS = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'

def fix_tables_in_docx(file_path):
    if not os.path.exists(file_path):
        print(f"❌ Archivo no encontrado: {file_path}")
        return

    # Extraer el contenido del docx (que es un zip)
    temp_dir = file_path + "_temp_xml"
    with zipfile.ZipFile(file_path, 'r') as zip_ref:
        zip_ref.extractall(temp_dir)

    doc_xml_path = os.path.join(temp_dir, 'word', 'document.xml')
    
    # Registrar namespaces para que ET no los rompa
    ET.register_namespace('w', "http://schemas.openxmlformats.org/wordprocessingml/2006/main")
    
    tree = ET.parse(doc_xml_path)
    root = tree.getroot()

    # Buscar todas las tablas <w:tbl>
    for tbl in root.iter(f'{W_NS}tbl'):
        # 1. Ajustar Propiedades de Tabla <w:tblPr>
        tblPr = tbl.find(f'{W_NS}tblPr')
        if tblPr is None:
            tblPr = ET.Element(f'{W_NS}tblPr')
            tbl.insert(0, tblPr)

        # A. Ancho al 100% (w:w="5000" w:type="pct")
        tblW = tblPr.find(f'{W_NS}tblW')
        if tblW is None:
            tblW = ET.Element(f'{W_NS}tblW')
            tblPr.append(tblW)
        tblW.set(f'{W_NS}w', "5000")
        tblW.set(f'{W_NS}type', "pct")

        # B. Centrado Automático <w:jc w:val="center"/>
        jc = tblPr.find(f'{W_NS}jc')
        if jc is None:
            jc = ET.Element(f'{W_NS}jc')
            tblPr.append(jc)
        jc.set(f'{W_NS}val', "center")

        # C. Bordes Profesionales <w:tblBorders>
        borders = tblPr.find(f'{W_NS}tblBorders')
        if borders is None:
            borders = ET.Element(f'{W_NS}tblBorders')
            tblPr.append(borders)
        
        border_styles = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
        for b in border_styles:
            side = borders.find(f'{W_NS}{b}')
            if side is None:
                side = ET.Element(f'{W_NS}{b}')
                borders.append(side)
            side.set(f'{W_NS}val', 'single')
            side.set(f'{W_NS}sz', '4') # 0.5 pt
            side.set(f'{W_NS}space', '0')
            side.set(f'{W_NS}color', '000000')

        # 2. Corregir Alineación en Celdas (de justified a left)
        # Recorremos todos los párrafos <w:p> dentro de la tabla
        for p in tbl.iter(f'{W_NS}p'):
            pPr = p.find(f'{W_NS}pPr')
            if pPr is not None:
                jc_p = pPr.find(f'{W_NS}jc')
                if jc_p is not None and jc_p.get(f'{W_NS}val') == 'both':
                    jc_p.set(f'{W_NS}val', 'left')

    # Guardar los cambios en el XML
    tree.write(doc_xml_path, encoding='UTF-8', xml_declaration=True)

    # Re-empaquetar el docx
    with zipfile.ZipFile(file_path, 'w', zipfile.ZIP_DEFLATED) as docx:
        for root_dir, dirs, files in os.walk(temp_dir):
            for file in files:
                abs_path = os.path.join(root_dir, file)
                rel_path = os.path.relpath(abs_path, temp_dir)
                docx.write(abs_path, rel_path)

    # Limpiar archivos temporales
    import shutil
    shutil.rmtree(temp_dir)
    print(f"✅ Tablas corregidas en: {file_path}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python3 fix-docx-tables.py <ruta_archivo.docx>")
        sys.exit(1)
    fix_tables_in_docx(sys.argv[1])
